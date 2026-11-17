# Egg Vision AI — Model Server (스켈레톤)

MONO/COLOR Vision AI 모델을 서빙하는 **별도 서버**. `backend/`와 완전히 독립된 프로세스이며,
추론 결과를 `POST /inspections`로 backend에 전달한다.

**지금은 실제 모델이 없어서 `app/model.py`가 스텁 상태다** — 항상 `NORMAL`/`confidence 0.5`를 반환한다.
전체 파이프라인(이미지 수신 → 추론 → backend 전달)은 지금 그대로 동작하니, 실제 모델이 준비되면
`app/model.py`의 `load_model()`/`run_inference()` 두 함수만 채우면 된다.

## 실행

MONO/COLOR는 각각 별도 프로세스(포트)로 띄운다.

```bash
cd src/core/ai_server
pip install -r requirements.txt

# 터미널 1 (MONO)
AI_SERVER_SOURCE=MONO ./run_dev.sh 8001

# 터미널 2 (COLOR)
AI_SERVER_SOURCE=COLOR ./run_dev.sh 8002
```

- Swagger UI: 콘솔에 출력되는 URL (`.../docs`)
- `AI_BACKEND_URL` 환경변수로 backend 주소를 바꿀 수 있다 (기본값 `http://127.0.0.1:8000`)
- `AI_MODEL_PATH` 환경변수에 실제 가중치 파일 경로를 지정하면, `load_model()`이 그 경로로 로드를
  시도한다 (지금은 TODO라 `NotImplementedError`를 던짐 - 실제 로드 코드를 채워야 함).

## API

`POST /predict`

```json
{
  "lineId": "LINE-01",
  "lotId": "0815M3FDS4",
  "captureId": "cap-0001",
  "images": [
    {"row": 1, "col": 1, "imageBase64": "<base64 인코딩된 jpg/png>"},
    {"row": 1, "col": 2, "imageBase64": "<...>"}
  ]
}
```

- `lineId`/`captureId`는 생략 가능 (각각 기본 라인, 자동 생성 캡처ID 사용)
- 응답에 `forwarded`(backend 전송 성공 여부)와 `backendStatus`(backend 응답 코드)가 포함된다

## 실제 모델 붙이는 법

1. `app/model.py`의 `load_model()`에 실제 가중치 로드 코드 작성 (PyTorch/ONNX 등 예시 주석 참고)
2. `run_inference(image_bytes)`가 `{"class": ..., "subClass": ..., "confidence": ...}`를 반환하도록 작성
   - `class`는 `MONO_CLASSES`/`COLOR_CLASSES` 안의 값이어야 한다 (backend의 `DefectType`과 동일)
   - `subClass`는 `class == "FOREIGN_MATERIAL"`이고 MONO일 때만 `FOREIGN_MATTER_SUBCLASSES` 중 하나
3. `requirements.txt` 하단에 필요한 프레임워크(torch 등) 추가 후 재설치
