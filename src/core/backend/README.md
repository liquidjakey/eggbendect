# Egg Vision AI — Backend

FastAPI 기반 백엔드 (`src/core/backend/`). `src/api`/`src/core/predict_module.py`(모델 추론 컨테이너
빌드용)와는 별개로, devenv 안에서 직접 실행해서 쓰는 REST API 서버입니다.

## 실행

```bash
cd src/core/backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# 또는 이 devenv(code-server) 프록시로 외부에서 접속 가능하게 띄우려면:
./run_dev.sh
```

- Swagger UI: http://localhost:8000/docs (devenv 프록시 사용 시 `run_dev.sh`가 출력하는 URL)
- DB는 Postgres를 씁니다 (기본값 `postgresql+psycopg://eggvision:eggvision@localhost:5432/eggvision`,
  이 devenv에 이미 프로비저닝돼 있음). 필요하면 `EGGVISION_DATABASE_URL` 환경변수로 바꿀 수 있습니다.
- 첫 실행 시 테이블이 자동 생성되고, 데모용 Lot(`0815M3FDS4`, `0816K8ABC2`) 데이터가 시드됩니다.
- 업로드 이미지는 `storage/`에 저장되고 `/static/...` 경로로 서빙됩니다 (실제 S3/MinIO로 교체하려면 `app/storage.py`만 수정하면 됩니다).

## MONO / COLOR 결과 전송 방법

라인은 MONO 전용 또는 COLOR 전용으로 완전히 분리돼 있습니다 (한 라인에 두 카메라가 같이
달려서 병합하던 예전 방식 아님). 각 라인은 자기 담당 소스로만 `POST /inspections`를 호출하면
됩니다 - 처음 보는 `lineId`면 이 요청의 `source`로 그 라인이 고정됩니다.

```bash
# MONO 전용 라인
curl -X POST http://localhost:8000/inspections \
  -H "Content-Type: application/json" \
  -d '{
    "lineId": "MONO-01",
    "lotId": "0815M3FDS4",
    "captureId": "cap-0001",
    "source": "MONO",
    "eggs": [
      {"row":1,"col":1,"class":"NORMAL","confidence":0.982},
      {"row":1,"col":2,"class":"CRACK","confidence":0.967},
      {"row":2,"col":4,"class":"FOREIGN_MATERIAL","confidence":0.951}
    ]
  }'

# COLOR 전용 라인
curl -X POST http://localhost:8000/inspections \
  -H "Content-Type: application/json" \
  -d '{
    "lineId": "COLOR-01",
    "lotId": "0815M3FDS4",
    "captureId": "cap-0002",
    "source": "COLOR",
    "eggs": [
      {"row":1,"col":1,"class":"NORMAL","confidence":0.979},
      {"row":1,"col":2,"class":"CRACK","confidence":0.958}
    ]
  }'
```

## 주요 엔드포인트

| 분류 | Method | Path |
|---|---|---|
| Auth | POST | `/auth/login` |
| 검사 | POST | `/inspections` (MONO 또는 COLOR 라인의 검사 결과 수집) |
| 검사 | GET | `/inspections` (목록/필터, page/size/lineId/isDefect/defectType) |
| 검사 | GET | `/inspections/{inspectionId}` |
| 검사 | POST | `/inspections/{inspectionId}/images` (이미지 업로드) |
| 검사 | GET | `/inspections/summary` |
| 검사 | GET | `/inspections/defect-statistics` |
| 검사 | GET | `/inspections/line-statistics` |
| 검사 | GET | `/inspections/recent-defects?limit=5` |
| 추적 | GET | `/traceability/{lotId}` |
| 추적 | GET | `/traceability/{lotId}/quality` |
| 추적 | GET | `/traceability/{lotId}/events` |
| 추적 | GET | `/traceability/{lotId}/inspections?result=DEFECT` |

## 로그인 (목업)

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"1234"}'
```
