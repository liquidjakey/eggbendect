"""
실제 Vision AI 모델(YOLO11n 객체 탐지) 연결.

MONO 가중치: src/core/models/mono_yolo11n.pt (work/mono_result/에서 팀원이 넘겨준 걸 복사해둠)
COLOR 가중치: src/core/models/color_yolo11n.pt (work/color_result/에서 복사해둠, 예비본)

MONO/COLOR는 class_id 체계가 서로 다르다 (예: id=2가 MONO는 BLOOD_SPOT, COLOR는
FOREIGN_MATERIAL). 클래스 이름을 하드코딩한 딕셔너리로 옮기면 소스별로 따로 관리해야
해서 어긋나기 쉬우므로, 대신 모델 자체가 갖고 있는 이름 매핑(result.names, 학습 시
결정됨)을 그대로 쓴다. class_name은 항상 모델 기준으로 정확하다.

GPU(cuda:0)가 있으면 자동으로 그쪽에서 돈다 - 없으면 CPU로 그대로 폴백.
"""

import functools
import io
import os

import torch
from PIL import Image

from app.config import MODEL_PATH, SOURCE

_DEVICE = "0" if torch.cuda.is_available() else "cpu"

_model = None

# COLOR 후보 모델 비교용 (2026-08-26 추가) - 실서비스 프로세스(color_yolo11n,
# 8002)는 그대로 두고, 테스트 포트 하나에서 model 파라미터로 골라 쓸 수 있게
# 프리셋을 이름으로 등록해둔다. 고른 모델은 첫 호출 때만 로드하고 캐시한다.
_COLOR_MODEL_PRESETS = {
    "yolo11n": "/home/jovyan/work/color_result/color_yolo11n.pt",
    "yolo11m": "/home/jovyan/work/color_result/color_yolo11m.pt",
    "rtdetr-l": "/home/jovyan/work/color_result/color_rtdetr-l.pt",
}
_model_cache: dict = {}


def _resolve_model(model_name: str | None):
    """model_name이 없으면 이 프로세스 기본 모델(_model), 있으면 프리셋에서
    찾아 로드/캐시해서 돌려준다."""
    if not model_name:
        return _model
    if model_name not in _COLOR_MODEL_PRESETS:
        raise ValueError(f"알 수 없는 model 이름: {model_name!r} (사용 가능: {list(_COLOR_MODEL_PRESETS)})")
    if model_name not in _model_cache:
        from ultralytics import YOLO

        _model_cache[model_name] = YOLO(_COLOR_MODEL_PRESETS[model_name])
        print(f"[ai_server:{SOURCE}] 비교용 모델 로드 완료: {model_name} ({_COLOR_MODEL_PRESETS[model_name]})")
    return _model_cache[model_name]


# ---------------------------------------------------------------------------
# 클래스 가중치 후처리 (COLOR 전용, 2026-08-26 추가)
#
# 왜 필요한가
#   이 문제의 '놓침' 은 계란을 못 찾는 게 아니라 유형을 잘못 맞히는 것이다.
#   실측(val 2,000판): 1순위가 틀린 계란의 약 90% 에서 정답 클래스가 2~3순위 후보로
#   살아있고, 점수 차가 근소한 경우가 많다 (0.405 vs 0.408 같은).
#
#   그런데 ultralytics 의 predict 는 NMS 에 multi_label 을 넘기지 않아(기본 False)
#   박스마다 argmax 클래스 하나만 남는다. 2순위 후보는 NMS 가 지우는 게 아니라
#   애초에 만들어지지 않는다.
#
#   그래서 multi_label 을 켜서 후보를 전부 받은 뒤, 점수에 클래스별 가중치를 곱하고
#   다시 argmax 한다. 계란당 검출은 정확히 1개로 유지되므로 격자 매핑이 깨지지 않는다.
#   (클래스별 '문턱' 을 낮추는 방식은 쓰면 안 된다 - 한 계란이 두 클래스로 동시에
#    검출돼 한 칸에 계란 2개가 들어간다.)
#
# 효과 (COLOR yolo11m · val 2,000판 실측)
#   macro Recall    0.8835 -> 0.9087  (+2.52%p)
#   macro Precision 0.9081 -> 0.8803  (-2.78%p)
#   macro F1        0.895  -> 0.894   (거의 동일)
#
#   DEFORMED 0.755->0.836 · DISCOLORATION 0.850->0.902 · CRACK 0.862->0.895
#   FOREIGN_MATERIAL 0.974->0.943 · NORMAL 0.976->0.967
#
#   즉 Precision 을 팔아 Recall 을 사는 거래다. COLOR 가 1차 필터이고 MONO 가 2차로
#   재검사하는 구조이므로 1차에서는 Recall 을 우선하는 것이 맞다. 1차에서 헛짚으면
#   2차가 걸러내지만, 1차에서 놓치면 2차는 볼 기회조차 없다.
#
# ★ 기본값은 꺼져 있다 (2026-08-26 결정). 이유:
#
#   1) macro F1 이 +0.06%p 로 사실상 제자리다. Precision 을 팔아 Recall 을 사는
#      거래이지 순수한 개선이 아니다.
#   2) 불량 검출 관점에서 이득이 없다. test 2,909개 전수 추적 결과:
#        결함 -> 다른 결함  79개 (2.7%)   유형만 바뀜. 여전히 불량으로 걸러짐
#        정상 -> 결함       16개 (0.5%)   멀쩡한 계란을 걸러냄
#        결함 -> 정상        1개 (0.03%)  불량을 놓침
#      즉 올라간 Recall 은 대부분 '이미 불량으로 잡히던 계란의 유형 라벨이
#      정확해진 것' 이고, 걸러내는 양 자체는 오히려 근소하게 손해다.
#   3) 0.03% 라도 불량이 정상으로 빠지는 방향이 생긴다.
#
#   실험 결과는 남겨둔다. 유형별 통계 정확도가 중요해지면 켤 수 있다.
#
# 켜는 법
#   AI_CLASS_WEIGHTS=1.6,2.5,1.0,3.0,3.0   (COLOR 클래스 순서: NORMAL,CRACK,
#                                            FOREIGN_MATERIAL,DISCOLORATION,DEFORMED)
#   위 값은 val 2,000판 좌표상승법 탐색으로 정하고 test 에서 재현 확인한 값이다
#   (macro Recall val +2.52%p / test +2.33%p).
#
# ※ MONO 는 클래스 체계가 달라 이 값을 그대로 쓰면 안 된다.
# ---------------------------------------------------------------------------
_DEFAULT_COLOR_WEIGHTS = ""      # 빈 값 = 꺼짐. 기존 argmax 동작 그대로
_IOU_GROUP = 0.5      # 같은 계란의 후보로 묶을 겹침 기준

# ★ 가중치를 곱할 후보를 받으려면 추론 문턱을 먼저 낮춰야 한다.
#   2순위 후보의 점수 중앙값이 0.210 이라 conf=0.25 로 추론하면 NMS 단계에서
#   이미 잘려나가 곱할 대상이 없어진다 (실측: 393개 계란 중 0개만 바뀜 = 무효).
#   낮은 문턱으로 받아서 -> 가중치 곱하고 -> 그다음에 요청된 conf 로 거른다.
_CAND_FLOOR = 0.01


def _parse_weights() -> list | None:
    raw = os.getenv("AI_CLASS_WEIGHTS")
    if raw is None:
        raw = _DEFAULT_COLOR_WEIGHTS if SOURCE == "COLOR" else ""
    if not raw or raw.lower() == "off":
        return None
    try:
        w = [float(x) for x in raw.split(",")]
    except ValueError:
        print(f"[ai_server:{SOURCE}] AI_CLASS_WEIGHTS 파싱 실패, 무시합니다: {raw!r}")
        return None
    return w


def _iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def _reweight(boxes, weights):
    """multi_label 로 받은 후보들을 계란 자리별로 묶고, 가중치를 곱해 하나만 남긴다.

    boxes: [(cls_id, conf, [x1,y1,x2,y2]), ...]  점수 내림차순
    반환 : 같은 형식, 계란 자리당 정확히 1개
    """
    out, used = [], [False] * len(boxes)
    for i, b in enumerate(boxes):
        if used[i]:
            continue
        used[i] = True
        cands = [b]
        for j in range(i + 1, len(boxes)):
            if not used[j] and _iou(b[2], boxes[j][2]) > _IOU_GROUP:
                used[j] = True
                cands.append(boxes[j])
        # 가중치를 곱해 다시 최고점 하나를 고른다 (계란당 1개 유지)
        best = max(cands, key=lambda c: c[1] * (weights[c[0]] if c[0] < len(weights) else 1.0))
        out.append(best)
    return out


def load_model() -> None:
    """서버 기동 시(FastAPI startup) 1회 호출된다."""
    global _model

    if not MODEL_PATH:
        print(f"[ai_server:{SOURCE}] AI_MODEL_PATH가 없어 스텁 추론으로 동작합니다.")
        return

    from ultralytics import YOLO

    _model = YOLO(MODEL_PATH)
    print(f"[ai_server:{SOURCE}] 모델 로드 완료: {MODEL_PATH} ({'GPU' if _DEVICE != 'cpu' else 'CPU'})")


def run_inference(image_bytes: bytes, conf: float = 0.25, model_name: str | None = None) -> dict:
    """
    트레이 사진 1장 -> 팀이 확정한 탐지 스키마 원본 그대로 반환.
    row/col은 여기서 매기지 않는다 (app/mapping.py가 row=3고정 레인 기준으로 따로 계산).

    model_name: 비워두면 이 프로세스 기본 모델을 쓴다. COLOR 모델 비교 테스트
    포트에서만 "yolo11n"/"yolo11m"/"rtdetr-l"로 다른 모델을 골라 쓸 수 있다.
    """
    active_model = _resolve_model(model_name)
    if active_model is None:
        # 모델 미설정 시 스텁 (파이프라인 연결 확인용)
        return {
            "image_id": "stub.jpg",
            "image_width": 1440,
            "image_height": 1080,
            "detections": [
                {"class_id": 0, "class_name": "NORMAL", "confidence": 0.55,
                 "bbox_xyxy": [50, 50, 250, 250]},
                {"class_id": 0, "class_name": "NORMAL", "confidence": 0.52,
                 "bbox_xyxy": [50, 450, 250, 650]},
                {"class_id": 0, "class_name": "NORMAL", "confidence": 0.58,
                 "bbox_xyxy": [50, 850, 250, 1050]},
            ],
            "summary": {"NORMAL": 3},
        }

    img = Image.open(io.BytesIO(image_bytes))
    weights = _parse_weights()

    if weights is None:
        # 기존 동작: 박스마다 argmax 클래스 하나.
        # agnostic_nms: 같은 계란이 두 클래스로 동시에 잡혀 중복되는 걸 막는다
        # (work/color_result/README.md 실측 - 미적용 시 중복 5.9%, 적용 시 0%).
        result = active_model.predict(source=img, conf=conf, device=_DEVICE,
                                agnostic_nms=True, verbose=False)[0]
        raw = [(int(b.cls.item()), float(b.conf.item()), b.xyxy[0].tolist())
               for b in result.boxes]
    else:
        # 가중치 적용: 2순위 후보까지 받아서 가중치를 곱해 다시 고른다.
        # ultralytics 가 multi_label 을 넘겨주지 않아 NMS 함수를 감싸서 강제로 켠다.
        from ultralytics.utils import nms as _nmsmod
        _orig = _nmsmod.non_max_suppression

        @functools.wraps(_orig)
        def _ml(*a, **k):
            k["multi_label"] = True
            return _orig(*a, **k)

        _nmsmod.non_max_suppression = _ml
        try:
            # agnostic_nms 는 꺼야 한다. 켜면 같은 계란의 다른 클래스 후보가
            # 여기서 지워져 가중치를 곱할 대상이 없어진다.
            result = active_model.predict(source=img, conf=min(conf, _CAND_FLOOR),
                                    device=_DEVICE, agnostic_nms=False,
                                    max_det=300, verbose=False)[0]
        finally:
            _nmsmod.non_max_suppression = _orig

        cand = [(int(b.cls.item()), float(b.conf.item()), b.xyxy[0].tolist())
                for b in result.boxes]
        cand.sort(key=lambda c: -c[1])
        raw = _reweight(cand, weights)   # 계란 자리당 1개로 정리 (격자 매핑 보호)
        # 낮춰서 받았으므로 여기서 원래 문턱을 적용한다
        raw = [c for c in raw if c[1] >= conf]

    img_w, img_h = result.orig_shape[1], result.orig_shape[0]

    detections = []
    for cls_id, cf, xyxy in raw:
        x_min, y_min, x_max, y_max = [round(v, 1) for v in xyxy]
        detections.append(
            {
                "class_id": cls_id,
                "class_name": result.names.get(cls_id, str(cls_id)),
                "confidence": round(cf, 4),
                "bbox_xyxy": [x_min, y_min, x_max, y_max],
            }
        )

    summary = {}
    for det in detections:
        summary[det["class_name"]] = summary.get(det["class_name"], 0) + 1

    return {
        "image_id": "capture.jpg",
        "image_width": img_w,
        "image_height": img_h,
        "detections": detections,
        "summary": summary,
    }
