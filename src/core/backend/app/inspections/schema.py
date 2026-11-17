import datetime as dt
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import DefectType, Source
from app.shared.schema import CamelModel


# ---------------------------------------------------------------------------
# 수집(ingest) 요청 — MONO/COLOR 모델 -> 백엔드
# ---------------------------------------------------------------------------

class EggGridResult(BaseModel):
    """MONO 또는 COLOR 모델이 한 칸(row,col)에 대해 내놓는 결과.
    subClass는 MONO의 이물질(FOREIGN_MATERIAL) 세부분류 전용 - 정확한 값 목록이
    아직 확정 전이라 느슨하게(문자열) 받는다."""

    row: int
    col: int
    class_: DefectType = Field(alias="class")
    subClass: Optional[str] = None
    confidence: float

    model_config = ConfigDict(populate_by_name=True)


class InspectionIngestRequest(BaseModel):
    lineId: str
    lotId: str
    captureId: str
    source: Source
    eggs: List[EggGridResult]


# ---------------------------------------------------------------------------
# 응답
# ---------------------------------------------------------------------------

class InspectionOut(CamelModel):
    inspectionId: int
    eggId: str
    lotId: str
    lineId: str
    row: int
    col: int
    source: Source
    isDefect: bool
    defectType: Optional[DefectType] = None
    subClass: Optional[str] = None
    confidence: Optional[float] = None
    imageUrl: Optional[str] = None
    inspectedAt: dt.datetime


class InspectionListOut(CamelModel):
    items: List[InspectionOut]
    page: int
    size: int
    totalElements: int


class SummaryOut(CamelModel):
    totalCount: int
    normalCount: int
    defectCount: int
    defectRate: float
    crackCount: int


class TodayTrendOut(CamelModel):
    todayCount: int
    yesterdaySameTimeCount: int
    changeRate: Optional[float] = None


class DefectStat(CamelModel):
    type: DefectType
    count: int
    rate: float


class DefectStatisticsOut(CamelModel):
    defects: List[DefectStat]


class LineStat(CamelModel):
    lineId: str
    source: Source
    totalCount: int
    defectCount: int
    defectRate: float
    foreignMaterialCount: int
    discolorationCount: int
    bloodSpotCount: int
    crackCount: int
    deformedCount: int
    lastInspectedAt: Optional[dt.datetime] = None


class LineStatisticsOut(CamelModel):
    lines: List[LineStat]


class OriginStat(CamelModel):
    originId: str
    owner: Optional[str] = None
    location: Optional[str] = None
    totalCount: int
    defectCount: int
    defectRate: float


class OriginStatisticsOut(CamelModel):
    origins: List[OriginStat]


class HourlyStat(CamelModel):
    hour: dt.datetime
    count: int


class HourlyStatisticsOut(CamelModel):
    hours: List[HourlyStat]


class LineAlert(CamelModel):
    lineId: str
    defectRate: float


class AlertsOut(CamelModel):
    threshold: float
    lines: List[LineAlert]


class RecentDefectItem(CamelModel):
    inspectionId: int
    eggId: str
    lineId: str
    defectType: Optional[DefectType] = None
    confidence: Optional[float] = None
    inspectedAt: dt.datetime


class RecentDefectsOut(CamelModel):
    items: List[RecentDefectItem]


class ImageUploadOut(CamelModel):
    inspectionId: int
    imageUrl: Optional[str] = None
