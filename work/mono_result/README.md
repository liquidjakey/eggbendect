# MONO 계란 품질 판정 — 백엔드 인계 패키지

## 포함된 파일
- `mono_yolo11n.pt` — 학습된 YOLO11n 모델 가중치 (val mAP50-95 0.780, epoch 72 기준 best.pt)
- `inference.py` — 모델 로드 + 추론 결과를 JSON으로 변환하는 코드
- `requirements.txt` — 정확히 이 버전으로 설치할 것 (아래 "주의사항" 참고)

## 설치
```bash
pip install -r requirements.txt
```

## 사용법
```python
from inference import load_model, predict_to_json

model = load_model("mono_yolo11n.pt")
result = predict_to_json(model, "tray_photo.jpg", tray_rows=3, tray_cols=5)
```

또는 CLI로 바로 확인:
```bash
python inference.py tray_photo.jpg 3 5
```

## 클래스 목록 (9개)
| class_id | class_name |
|---|---|
| 0 | NORMAL |
| 1 | CRACK |
| 2 | BLOOD_SPOT |
| 3 | DISCOLORATION |
| 4 | FOREIGN_MATERIAL_EGGSHELL |
| 5 | FOREIGN_MATERIAL_FEATHER |
| 6 | FOREIGN_MATERIAL_CHICKEN_DROPPINGS |
| 7 | FOREIGN_MATERIAL_SPECKLED |
| 8 | DEFORMED |

## 출력 JSON 스펙
```json
{
  "image_id": "파일명.jpg",
  "image_width": 1440,
  "image_height": 1080,
  "tray": {"rows": 3, "cols": 5},
  "detections": [
    {
      "class_id": 4,
      "class_name": "FOREIGN_MATERIAL_EGGSHELL",
      "confidence": 0.9123,
      "bbox_xyxy": [201.1, 724.8, 436.4, 1030.3],
      "row": 1,
      "col": 2
    }
  ],
  "summary": {"NORMAL": 8, "FOREIGN_MATERIAL_EGGSHELL": 3, "CRACK": 1}
}
```
- `bbox_xyxy`는 픽셀 절대좌표 (정규화 아님) — 바로 그려서 쓸 수 있음
- `tray`/`row`/`col`은 `tray_rows`/`tray_cols`를 넘겼을 때만 포함됨. 안 넘기면 예전 포맷(row/col/tray 없이 detections만)으로 나감
- `row`/`col`은 bbox 중심 좌표를 격자에 단순 매핑한 값(1-indexed) — **트레이 사진이 균등한 격자로, 정면에서 찍혀 있어야 정확함**. 기울어지거나 간격이 불균일하면 오차 가능
- 같은 슬롯(row, col)에 detection이 여러 개 겹치면 **confidence가 가장 높은 것만 남김** (달걀 한 개 = detection 한 개 보장)
- 배치 처리는 `predict_batch_to_json(model, image_dir, tray_rows=.., tray_cols=..)` — `{"results": [...]}`로 감싸서 반환

## 주의사항
- **`torch`와 `torchvision`은 항상 같이, 같은 `--index-url`로 설치할 것.** 하나만 따로 업그레이드하면 `operator torchvision::nms does not exist` 에러가 남 (버전 ABI 불일치).
- `requirements.txt`의 `cu128`은 이 모델을 학습한 서버 기준(NVIDIA driver 580.159.03, CUDA 13.0)이라, 백엔드 서버 GPU/드라이버 버전이 다르면 `cu128` 부분을 서버에 맞는 CUDA 빌드로 바꿔야 할 수 있음. `nvidia-smi`로 서버의 CUDA 버전 먼저 확인 권장.
- `conf=0.25`가 기본 임계값. 오탐/미탐 비율 보고 필요하면 조정 (`predict_to_json(..., conf=0.3)` 식으로).
- 클래스 불균형이 있어서(`NORMAL`이 `FOREIGN_MATERIAL_EGGSHELL`보다 87배 많음) `FOREIGN_MATERIAL_FEATHER`(mAP50-95 0.55), `DEFORMED`(0.66) 클래스는 상대적으로 정확도가 낮음 — 백엔드/프론트에서 이 두 클래스는 신뢰도 표시나 재검토 플로우를 고려하는 게 좋음.
