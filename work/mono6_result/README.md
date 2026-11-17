# MONO 계란 품질 판정 — YOLO11m 후보 모델 (6-class, 아직 실서비스 교체 보류)

## 요약
`mono_result/`(9-class YOLO11n)와 `rtdetr_result/`(RT-DETR-L 실험 기록)에 이어 만든 모델로, 6-class 기준으로는 지금까지 비교한 모델 중 가장 좋은 성능입니다.

**⚠️ 아직 실서비스(`src/core/ai_server`) MONO 모델을 이걸로 교체하면 안 됩니다.** 현재 `src/core/ai_server/app/mapping.py`의 `split_class_name()`은 모델이 `"FOREIGN_MATERIAL_EGGSHELL"` 같은 9-class 세부 클래스명을 내야 `class`/`subClass`로 분리할 수 있게 설계돼 있습니다. 이 yolo11m은 6-class라 `subClass`가 항상 `None`이 되어, 지금 연결된 9-class `mono_yolo11n.pt`(정확도는 더 낮지만 subClass를 제공함) 대비 기능이 후퇴합니다.

**교체 계획**: 6-class 탐지(이 모델) + 이물질 소분류 2차 분류기(별도 진행 중, test top1 86%)를 결합해서 `FOREIGN_MATERIAL_EGGSHELL` 같은 9-class 형태로 출력을 복원한 뒤, 그때 실서비스 모델을 교체합니다. 그 전까지 이 패키지는 **참고/실험 기록**으로만 보관합니다.

| 모델 | test mAP50-95 |
|---|---|
| yolo11n (9-class, 데이터 누수 있음) | 0.78 |
| yolo11n (6-class, leak-free) | 0.797 (val) |
| yolo11s (6-class, leak-free) | 0.818 (val) |
| RT-DETR-L (6-class, leak-free) | 0.792 (test) |
| **yolo11m (6-class, leak-free) — 이 패키지** | **0.8374 (test)** |

## 포함된 파일
- `mono6_yolo11m.pt` — 학습된 YOLO11m 모델 가중치 (best.pt, epoch 23 기준, patience=20으로 epoch 43 조기종료)
- `inference.py` — 모델 로드 + 추론 결과를 JSON으로 변환하는 코드 (6-class 대분류 기준)
- `requirements.txt` — 정확히 이 버전으로 설치할 것 (아래 "주의사항" 참고)

## 설치
```bash
pip install -r requirements.txt
```

## 사용법
```python
from inference import load_model, predict_to_json

model = load_model("mono6_yolo11m.pt")
result = predict_to_json(model, "tray_photo.jpg", tray_rows=3, tray_cols=5)
```

또는 CLI로 바로 확인:
```bash
python inference.py tray_photo.jpg 3 5
```

## 클래스 목록 (6개, 대분류만 — 이물질 소분류는 통합됨)
| class_id | class_name |
|---|---|
| 0 | NORMAL |
| 1 | CRACK |
| 2 | BLOOD_SPOT |
| 3 | DISCOLORATION |
| 4 | FOREIGN_MATERIAL |
| 5 | DEFORMED |

## 클래스별 test 성능 (mAP50-95)
| 클래스 | mAP50-95 |
|---|---|
| NORMAL | 0.8437 |
| CRACK | 0.8835 |
| BLOOD_SPOT | 0.8615 |
| DISCOLORATION | 0.8380 |
| FOREIGN_MATERIAL | 0.8958 |
| DEFORMED | 0.7017 |

## 출력 JSON 스펙
`mono_result/`, `rtdetr_result/`와 동일한 포맷입니다.
```json
{
  "image_id": "파일명.jpg",
  "image_width": 1440,
  "image_height": 1080,
  "tray": {"rows": 3, "cols": 5},
  "detections": [
    {
      "class_id": 4,
      "class_name": "FOREIGN_MATERIAL",
      "confidence": 0.9123,
      "bbox_xyxy": [201.1, 724.8, 436.4, 1030.3],
      "row": 1,
      "col": 2
    }
  ],
  "summary": {"NORMAL": 8, "FOREIGN_MATERIAL": 3, "CRACK": 1}
}
```
- `bbox_xyxy`는 픽셀 절대좌표 (정규화 아님) — 바로 그려서 쓸 수 있음
- `tray`/`row`/`col`은 `tray_rows`/`tray_cols`를 넘겼을 때만 포함됨
- 같은 슬롯(row, col)에 detection이 여러 개 겹치면 confidence가 가장 높은 것만 남김
- 배치 처리는 `predict_batch_to_json(model, image_dir, tray_rows=.., tray_cols=..)`

## 주의사항
- **`torch`와 `torchvision`은 항상 같이, 같은 `--index-url`로 설치할 것.** 하나만 따로 업그레이드하면 `operator torchvision::nms does not exist` 에러가 남 (버전 ABI 불일치).
- `requirements.txt`의 `cu128`은 학습 서버 기준(NVIDIA A100, CUDA 13.0)이라, 백엔드 서버 GPU/드라이버 버전이 다르면 조정 필요할 수 있음.
- `conf=0.25`가 기본 임계값.
- **DEFORMED 클래스(mAP50-95 0.70)가 상대적으로 약함** — recall이 낮아서 실제 기형란 중 일부를 놓칠 수 있습니다. 백엔드/프론트에서 이 클래스는 신뢰도 표시나 재검토 플로우를 고려하는 게 좋습니다. (현재 DEFORMED 개선을 위한 오버샘플링 재학습 실험이 별도로 진행 중이며, 개선되면 후속 버전으로 갱신 예정)
- 이물질 소분류(EGGSHELL/FEATHER/CHICKEN_DROPPINGS/SPECKLED)는 이 모델에서 구분하지 않는다 (전부 FOREIGN_MATERIAL로 통합). 소분류 분류기는 별도 개발 중.
