import datetime as dt
from typing import List, Optional

from pydantic import BaseModel

from app.shared.enums import DefectType, RiskLevel
from app.shared.schema import CamelModel


class OriginOut(BaseModel):
    originId: Optional[str] = None
    owner: Optional[str] = None
    location: Optional[str] = None


class RearingEnvironmentOut(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None


class TraceOriginOut(BaseModel):
    lotId: str
    origin: OriginOut
    rearingEnvironment: Optional[RearingEnvironmentOut] = None
    onHold: bool = False


class LotHoldRequest(BaseModel):
    onHold: bool


class LotHoldOut(BaseModel):
    lotId: str
    onHold: bool


class TraceQualityDefect(CamelModel):
    type: DefectType
    count: int


class TraceQualityOut(CamelModel):
    lotId: str
    totalCount: int
    defectCount: int
    defectRate: float
    majorDefectType: Optional[DefectType] = None
    riskLevel: RiskLevel
    defects: List[TraceQualityDefect]


class TraceEventOut(CamelModel):
    seq: int
    stage: str
    occurredAt: dt.datetime
    label: str
    location: Optional[str] = None
    qty: Optional[int] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    referenceNo: Optional[str] = None


class TraceEventsOut(CamelModel):
    lotId: str
    events: List[TraceEventOut]
