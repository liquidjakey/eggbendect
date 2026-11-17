from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EggPrediction(BaseModel):
    row: int
    col: int
    class_: str = Field(alias="class")
    subClass: Optional[str] = None
    confidence: float

    model_config = ConfigDict(populate_by_name=True)


class PredictResponse(BaseModel):
    source: str
    lineId: str
    lotId: str
    captureId: str
    eggCount: int
    eggs: List[EggPrediction]
    forwarded: bool  # backend(POST /inspections) 전송 성공 여부
    backendStatus: Optional[int] = None
    croppedImagesUploaded: int  # 계란별 크롭 이미지 업로드 성공 개수


class PredictAcceptedResponse(BaseModel):
    """/predict-async 전용 - 추론 자체는 아직 안 끝났고 큐에 접수만 됐다는 뜻.
    실제 판정 결과는 이 응답에 없다(비동기라 이 시점엔 아직 없음)."""
    accepted: bool
    source: str
    lineId: str
    lotId: str
    captureId: str
