import uuid
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from prometheus_client import Gauge
from prometheus_fastapi_instrumentator import Instrumentator

from app import imaging, mapping, model
from app.client import forward_to_backend, upload_egg_images_batch
from app.config import DEFAULT_LINE_ID, MODEL_LABEL, SOURCE
from app.kafka_client import publish_image_request
from app.schema import EggPrediction, PredictAcceptedResponse, PredictResponse

app = FastAPI(
    title=f"Egg Vision AI Model Server ({SOURCE}: {MODEL_LABEL})",
    version="2.0.0",
    description=f"{SOURCE} 카메라 전용 계란 품질 추론 서버 - 모델: {MODEL_LABEL}.",
    openapi_tags=[
        {"name": "추론", "description": "트레이 사진 분석 및 backend 전달"},
        {"name": "상태확인", "description": "서버 상태 확인"},
    ],
)


Instrumentator().instrument(app).expose(app, tags=["상태확인"])

# MONO/COLOR 두 서버가 같은 물리 GPU를 나눠 쓰므로(HAMI-core vGPU) 값 자체는
# 서버 인스턴스끼리 동일하게 보일 수 있다 - 그래도 "부하를 늘렸을 때 진짜
# 병목이 GPU인지"를 보려면 필요해서 프로세스가 실제 쓰는 디바이스(_DEVICE)
# 기준으로 노출한다. GPU가 없거나 pynvml/드라이버 조회가 실패해도 서버가
# 죽으면 안 되니 항상 0으로 조용히 폴백한다.
try:
    import pynvml

    pynvml.nvmlInit()
    _gpu_handle = pynvml.nvmlDeviceGetHandleByIndex(int(model._DEVICE)) if model._DEVICE != "cpu" else None
except Exception:
    pynvml = None
    _gpu_handle = None


def _gpu_util_percent() -> float:
    if not pynvml or _gpu_handle is None:
        return 0
    try:
        return pynvml.nvmlDeviceGetUtilizationRates(_gpu_handle).gpu
    except Exception:
        return 0


def _gpu_mem_used_mb() -> float:
    if not pynvml or _gpu_handle is None:
        return 0
    try:
        return pynvml.nvmlDeviceGetMemoryInfo(_gpu_handle).used / (1024**2)
    except Exception:
        return 0


def _gpu_mem_total_mb() -> float:
    if not pynvml or _gpu_handle is None:
        return 0
    try:
        return pynvml.nvmlDeviceGetMemoryInfo(_gpu_handle).total / (1024**2)
    except Exception:
        return 0


gpu_utilization = Gauge("gpu_utilization_percent", "GPU 사용률 (%)")
gpu_memory_used = Gauge("gpu_memory_used_mb", "GPU 메모리 사용량 (MB)")
gpu_memory_total = Gauge("gpu_memory_total_mb", "GPU 메모리 총량 (MB)")
gpu_utilization.set_function(_gpu_util_percent)
gpu_memory_used.set_function(_gpu_mem_used_mb)
gpu_memory_total.set_function(_gpu_mem_total_mb)


@app.on_event("startup")
def on_startup():
    model.load_model()


@app.get("/health", tags=["상태확인"], summary="헬스체크")
def health():
    """서버 상태 및 소속 소스(MONO/COLOR)·모델 확인용 헬스체크."""
    return {"status": "ok", "source": SOURCE, "model": MODEL_LABEL}


def _predict_with_model(lotId: str, lineId: Optional[str], captureId: Optional[str],
                         image: UploadFile, model_name: Optional[str]) -> PredictResponse:
    """/predict와 모델 이름별 편의 엔드포인트(/predict/yolo11m 등)가 공유하는 본체."""
    image_bytes = image.file.read()

    line_id = lineId or DEFAULT_LINE_ID
    capture_id = captureId or f"cap-{uuid.uuid4().hex[:10]}"

    # 1) 트레이 사진 1장 통째로 추론 (row=3고정 레인, col=그 안에서 왼쪽->오른쪽 순번)
    detection_result = model.run_inference(image_bytes, model_name=model_name)
    eggs_raw = mapping.detections_to_eggs(detection_result)

    # 2) backend로 전달 (bboxXyxy는 backend 스키마에 없는 필드라 빼고 보낸다)
    payload = {
        "lineId": line_id,
        "lotId": lotId,
        "captureId": capture_id,
        "source": SOURCE,
        "eggs": [
            {
                "row": e["row"],
                "col": e["col"],
                "class": e["class"],
                "subClass": e["subClass"],
                "confidence": e["confidence"],
            }
            for e in eggs_raw
        ],
    }
    forwarded, backend_status, inspections = forward_to_backend(payload)

    # 3) backend가 만들어준 inspectionId에 맞춰, 원본 사진에서 bbox만큼 잘라 업로드
    # (계란마다 따로 업로드하면 트레이당 최대 16번 왕복이라, 한 트레이 분량을
    # 모아서 배치 엔드포인트로 한 번에 보낸다)
    cropped_count = 0
    if forwarded and inspections:
        by_row_col = {(e["row"], e["col"]): e for e in eggs_raw}
        batch_items = []
        for insp in inspections:
            egg = by_row_col.get((insp["row"], insp["col"]))
            if egg is None:
                continue
            crop_bytes = imaging.crop_bbox(image_bytes, egg["bboxXyxy"])
            batch_items.append((insp["inspectionId"], crop_bytes))
        cropped_count = upload_egg_images_batch(batch_items)

    eggs = [
        EggPrediction(
            row=e["row"],
            col=e["col"],
            confidence=e["confidence"],
            subClass=e["subClass"],
            **{"class": e["class"]},
        )
        for e in eggs_raw
    ]

    return PredictResponse(
        source=SOURCE,
        lineId=line_id,
        lotId=lotId,
        captureId=capture_id,
        eggCount=len(eggs),
        eggs=eggs,
        forwarded=forwarded,
        backendStatus=backend_status,
        croppedImagesUploaded=cropped_count,
    )


@app.post("/predict", response_model=PredictResponse, tags=["추론"], summary="트레이 사진 추론")
def predict(
    lotId: str = Form(...),
    lineId: Optional[str] = Form(None),
    captureId: Optional[str] = Form(None),
    image: UploadFile = File(..., description="트레이 전체 사진 1장 (계란 여러 개가 한 장에 찍힘)"),
):
    """
    트레이 사진 1장(파일 업로드)을 입력받아:
    1) YOLO 모델로 계란별 결함 탐지 (row=3 고정 레인, col=행 내 좌→우 순번)
    2) 결과를 backend `/inspections`로 전달해 계란별 검사 레코드 생성
    3) 원본 사진에서 계란별 bbox만큼 잘라 backend에 이미지 업로드
    """
    return _predict_with_model(lotId, lineId, captureId, image, model_name=None)


@app.post("/predict-async", response_model=PredictAcceptedResponse, tags=["추론"],
          summary="트레이 사진 추론(비동기, Kafka 경유)")
def predict_async(
    lotId: str = Form(...),
    lineId: Optional[str] = Form(None),
    captureId: Optional[str] = Form(None),
    image: UploadFile = File(..., description="트레이 전체 사진 1장 (계란 여러 개가 한 장에 찍힘)"),
):
    """
    /predict와 달리 추론을 이 요청 안에서 끝내지 않는다 - 이미지를 Kafka
    `image-requests` 토픽에 올리고 바로 202를 반환한다. 실제 추론 + backend
    저장은 app/consumer.py가 별도 프로세스로 자기 처리 속도만큼 소비한다.

    순간적으로 요청이 몰려도(실측: 30rps에서 동기 방식은 99%대 타임아웃) 이
    토픽이 버퍼가 되어 요청 자체는 유실되지 않는다 - 다만 판정 결과를 이
    응답으로 바로 받을 수는 없다(폴링/조회 API로 나중에 확인해야 함).
    """
    image_bytes = image.file.read()
    line_id = lineId or DEFAULT_LINE_ID
    capture_id = captureId or f"cap-{uuid.uuid4().hex[:10]}"

    publish_image_request(image_bytes, line_id=line_id, lot_id=lotId, capture_id=capture_id, source=SOURCE)

    return PredictAcceptedResponse(
        accepted=True, source=SOURCE, lineId=line_id, lotId=lotId, captureId=capture_id
    )


@app.post("/predict/yolo11m", response_model=PredictResponse, tags=["추론"],
          summary="[비교용] color_yolo11m으로 추론")
def predict_yolo11m(
    lotId: str = Form(...),
    lineId: Optional[str] = Form(None),
    captureId: Optional[str] = Form(None),
    image: UploadFile = File(..., description="트레이 전체 사진 1장 (계란 여러 개가 한 장에 찍힘)"),
):
    """color_yolo11m 후보 모델로 고정해서 추론 (COLOR 모델 비교 테스트 전용)."""
    return _predict_with_model(lotId, lineId, captureId, image, model_name="yolo11m")


@app.post("/predict/rtdetr-l", response_model=PredictResponse, tags=["추론"],
          summary="[비교용] color_rtdetr-l으로 추론")
def predict_rtdetr_l(
    lotId: str = Form(...),
    lineId: Optional[str] = Form(None),
    captureId: Optional[str] = Form(None),
    image: UploadFile = File(..., description="트레이 전체 사진 1장 (계란 여러 개가 한 장에 찍힘)"),
):
    """color_rtdetr-l 후보 모델로 고정해서 추론 (COLOR 모델 비교 테스트 전용)."""
    return _predict_with_model(lotId, lineId, captureId, image, model_name="rtdetr-l")
