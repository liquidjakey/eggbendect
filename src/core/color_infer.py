"""판 사진 1장 -> 백엔드 계약 JSON.

bbox 는 [x_min, y_min, x_max, y_max] 절대 픽셀이며, 입력 이미지 해상도 기준이다.
정규화 좌표(xywhn/xyxyn)를 쓰면 안 된다 - 격자 계산이 픽셀 단위이기 때문이다.

★ 격자 규칙은 여기서 따로 만들지 않고 실서비스 코드를 그대로 불러 쓴다.
  ai_server/app/mapping.py 가 정본이고, 이 파일은 그걸 감싸기만 한다.
  두 벌이 되면 한쪽만 고쳐서 어긋나고, 무엇보다 우리가 측정한 값이
  실제 서비스 동작과 달라져 측정 자체가 무의미해진다.

  행: 이미지 높이 3등분 (레일 3줄은 물리적으로 고정)
      val 정답 라벨 실측 - 행 중심이 높이 대비 202209 0.223/0.498/0.771,
      202210 0.195/0.498/0.802 로 3등분 경계(0.333/0.667) 안에 전부 들어온다.
  열: 같은 행 안에서 왼쪽->오른쪽 순번

  ※ 열 규칙에 알려진 한계가 있다 (mapping.py 쪽 사안이라 여기서 고치지 않는다).
    같은 물리 열인데 행마다 앞쪽에 빈 칸 수가 다르면 col 이 서로 달라진다.
    val 정답 라벨 4,089 판 중 55.3% 에서 발생한다. 또 계란 하나를 놓치면
    그 행에서 오른쪽 계란의 col 이 전부 한 칸씩 밀린다 - col 은 MONO/COLOR
    병합 키(line_id, capture_id, row, col)의 일부라 병합이 어긋날 수 있다.
    전체 x 좌표로 군집하면 해소되지만, 서비스 코드와 기존 DB 기록에 영향이
    있어 담당자 판단이 필요하다. (2026-08-24 측정, 이슈 #6 참고)
"""
import json
import sys
from pathlib import Path

from PIL import Image

# ai_server/app/mapping.py 는 import 가 하나도 없는 순수 함수 파일이라 그대로 불러 쓴다.
sys.path.insert(0, str(Path(__file__).resolve().parent / "ai_server"))
from app.mapping import FIXED_ROWS, detections_to_eggs


def to_grid(dets, image_height):
    """dets: [(cx, cy, cls, conf, bbox), ...] - cx,cy 는 중심 절대 px

    격자 배정은 mapping.detections_to_eggs() 에 위임한다.
    image_height 가 필요한 이유: 행을 높이 3등분으로 나누기 때문이다.
    """
    if not dets:
        return {"tray": {"rows": FIXED_ROWS, "cols": 0}, "eggs": []}

    eggs_raw = detections_to_eggs({
        "image_height": image_height,
        "detections": [
            {"class_name": cls, "confidence": conf, "bbox_xyxy": bbox}
            for _cx, _cy, cls, conf, bbox in dets
        ],
    })

    eggs = sorted(
        [{"row": e["row"], "col": e["col"], "class": e["class"],
          "subClass": None, "confidence": round(e["confidence"], 3),
          "bbox": e["bboxXyxy"]}
         for e in eggs_raw],
        key=lambda e: (e["row"], e["col"]))

    cols = max((e["col"] for e in eggs), default=0)
    return {"tray": {"rows": FIXED_ROWS, "cols": cols}, "eggs": eggs}


def predict_tray(model, img_path):
    """판 사진 1장 -> 백엔드 계약 dict"""
    # agnostic_nms=True : 계란 하나 = 클래스 하나이므로 클래스 구분 없이 중복 제거.
    # 기본값(False)이면 같은 계란이 FOREIGN_MATERIAL 과 DISCOLORATION 으로 동시에
    # 잡혀 한 칸에 계란 2개가 들어간다 (val 300판 실측 중복 5.9% -> 0%).
    r = model(img_path, verbose=False, agnostic_nms=True)[0]
    dets = []
    for i in range(len(r.boxes)):
        cx, cy, _, _   = r.boxes.xywh[i].tolist()    # 절대 px — 격자 계산용
        x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()    # 절대 px — 출력용
        dets.append((cx, cy, r.names[int(r.boxes.cls[i])], float(r.boxes.conf[i]),
                     [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]))

    W, H = Image.open(img_path).size   # ★ 상수로 박지 않고 실제 이미지에서 읽는다
    grid = to_grid(dets, H)
    return {"image": {"width": W, "height": H}, **grid}


if __name__ == "__main__":
    import sys
    from ultralytics import YOLO
    weights = sys.argv[1] if len(sys.argv) > 1 else "runs/detect/yolo11n/weights/best.pt"
    img     = sys.argv[2]
    print(json.dumps(predict_tray(YOLO(weights), img), ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# 백엔드가 요청한 평평한 스키마 (2026-08-19 전달본)
#
# 백엔드 확인 완료 (2026-08-19):
#   - 처음 받은 예시는 MONO 담당자 것이었다. 클래스 번호·이름은 COLOR 기준
#     그대로 보내면 백엔드가 필터링한다. 소분류(_EGGSHELL)는 붙이지 않는다.
#   - 격자(row/col, tray)는 우리가 계산해서 같이 보낸다. row_tol/col_tol 이
#     해상도에 묶인 값이라 우리가 관리하는 편이 안전하다. 백엔드는 안 쓰면 무시.
# ---------------------------------------------------------------------------

CLASS_IDS = {"NORMAL": 0, "CRACK": 1, "FOREIGN_MATERIAL": 2,
             "DISCOLORATION": 3, "DEFORMED": 4}


def predict_flat(model, img_path):
    """백엔드 요청 스키마(image_id / detections / summary)로 반환한다."""
    from collections import Counter
    from pathlib import Path

    r = model(img_path, verbose=False, agnostic_nms=True)[0]
    W, H = Image.open(img_path).size          # 상수로 박지 않고 실제 이미지에서 읽는다

    raw, counts = [], Counter()
    for i in range(len(r.boxes)):
        name = r.names[int(r.boxes.cls[i])]
        cx, cy, _, _   = r.boxes.xywh[i].tolist()   # 절대 px — 격자 계산용
        x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()   # 절대 px — 출력용
        raw.append((cx, cy, name, float(r.boxes.conf[i]),
                    [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]))
        counts[name] += 1

    grid = to_grid(raw, H)                          # row/col 부여
    dets = [{
        "class_id":   CLASS_IDS[e["class"]],
        "class_name": e["class"],
        "confidence": e["confidence"],
        "bbox_xyxy":  e["bbox"],
        "row":        e["row"],
        "col":        e["col"],
    } for e in grid["eggs"]]

    return {
        "image_id":     Path(img_path).name,
        "image_width":  W,
        "image_height": H,
        "tray":         grid["tray"],
        "detections":   dets,
        "summary":      dict(counts),
    }


def resolve_image(src):
    """message 에 이미지가 어떤 형태로 담겨 와도 로컬 경로로 바꿔준다.

    base64 문자열 / 로컬 경로 / s3://(MinIO) / http(s):// 를 모두 받는다.
    백엔드가 어떤 형태로 보낼지 아직 미확정이므로 넷 다 대응한다.
    """
    import base64, tempfile, os, urllib.request

    if not isinstance(src, str):
        raise TypeError(f"이미지 입력이 문자열이 아니다: {type(src)}")

    if src.startswith(("http://", "https://")):
        fd, path = tempfile.mkstemp(suffix=".jpg"); os.close(fd)
        urllib.request.urlretrieve(src, path)
        return path

    if src.startswith("s3://"):
        from oneflowai import minio_client            # 플랫폼 제공 라이브러리
        bucket, key = src[5:].split("/", 1)
        fd, path = tempfile.mkstemp(suffix=".jpg"); os.close(fd)
        minio_client.download_file(object_name=key, bucket=bucket, file_path=path)
        return path

    if os.path.exists(src):
        return src

    # 남은 경우는 base64 (data URL 접두어가 붙어 올 수도 있다)
    b64 = src.split(",", 1)[-1]
    fd, path = tempfile.mkstemp(suffix=".jpg")
    with os.fdopen(fd, "wb") as f:
        f.write(base64.b64decode(b64))
    return path
