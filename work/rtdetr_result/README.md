# MONO 계란 품질 판정 — RT-DETR 실험 기록 (참고용, 프로덕션 추천 모델 아님)

## 요약
RT-DETR(rtdetr-l)로 6-class(대분류) leak-free 데이터를 학습한 실험 결과물이다. **현재 기준 프로덕션 추천 모델은 이 RT-DETR이 아니라 yolo11s(leak-free)다** — 아래 비교표 참고. 이 패키지는 실험 기록 및 향후 재비교를 위해 함께 인계한다.

| 모델 | test mAP50-95 |
|---|---|
| yolo11n (leak-free) | 0.797 (val 기준) |
| **yolo11s (leak-free) — 현재 추천 모델** | **0.818** (val 기준) |
| RT-DETR-l (leak-free) | 0.792 (test 기준) |

RT-DETR이 yolo11s보다 mAP가 낮고, 파라미터 수(약 3,200만)가 yolo11s(약 940만)의 3배 이상이라 추론 속도도 더 느릴 것으로 예상된다 — 속도·정확도 둘 다 yolo11s에 밀리는 상태다. transformer 기반 attention이 CNN 대비 이점이 있는지 확인하려는 목적의 비교 실험이었고, 이번 데이터/설정에서는 뚜렷한 이점을 확인하지 못했다.

## 포함된 파일
- `rtdetr_mono6.pt` — 학습된 RT-DETR 모델 가중치 (best.pt, epoch 13 기준, patience=20으로 epoch 33에서 조기종료)
- `inference.py` — 모델 로드 + 추론 결과를 JSON으로 변환하는 코드 (6-class 대분류 기준)
- `requirements.txt` — 정확히 이 버전으로 설치할 것 (아래 "주의사항" 참고, `mono_result/`와 동일 환경)

## 설치
```bash
pip install -r requirements.txt
```

## 사용법
```python
from inference import load_model, predict_to_json

model = load_model("rtdetr_mono6.pt")
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
| NORMAL | 0.7754 |
| CRACK | 0.8587 |
| BLOOD_SPOT | 0.7916 |
| DISCOLORATION | 0.7510 |
| FOREIGN_MATERIAL | 0.8836 |
| DEFORMED | 0.6889 |

`mono_result/`(9-class yolo11n)와 마찬가지로 DEFORMED가 가장 약한 클래스다.

## 출력 JSON 스펙
`mono_result/inference.py`와 동일한 포맷이다 (`class_id`가 6-class 기준으로 바뀐 것만 다름).
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
- **이 모델은 현재 프로덕션 추천 모델이 아니다.** yolo11s(leak-free)가 정확도·속도 모두 더 나은 상태다. 백엔드에 연결한다면 A/B 비교나 참고용으로만 쓰길 권장한다.
- `torch`와 `torchvision`은 항상 같이, 같은 `--index-url`로 설치할 것 (버전 ABI 불일치 방지는 `mono_result/README.md` 참고).
- `requirements.txt`의 `cu128`은 학습 서버 기준(NVIDIA A100, CUDA 13.0)이라 백엔드 서버 환경에 맞게 조정 필요할 수 있음.
- `conf=0.25`가 기본 임계값.
- 이물질 소분류(EGGSHELL/FEATHER/CHICKEN_DROPPINGS/SPECKLED)는 이 모델에서 구분하지 않는다 (전부 FOREIGN_MATERIAL로 통합). 소분류 분류기는 별도로 개발 중.
