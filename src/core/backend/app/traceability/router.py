from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import DEFAULT_PAGE_SIZE
from app.database import get_db
from app.inspections import service as inspections_service
from app.inspections.model import Inspection
from app.inspections.schema import InspectionListOut
from app.shared.enums import REARING_ENVIRONMENT_LABELS, RearingEnvironment
from app.traceability import service
from app.traceability.model import Lot, LotEvent, Origin
from app.traceability.schema import (
    LotHoldOut,
    LotHoldRequest,
    OriginOut,
    RearingEnvironmentOut,
    TraceEventOut,
    TraceEventsOut,
    TraceOriginOut,
    TraceQualityOut,
)

router = APIRouter(prefix="/traceability", tags=["이력관리"])


def _get_lot_or_404(db: Session, lot_id: str) -> Lot:
    lot = db.get(Lot, lot_id)
    if lot is None:
        raise HTTPException(status_code=404, detail="난각번호를 찾을 수 없습니다.")
    return lot


@router.get("/{lotId}", response_model=TraceOriginOut, summary="난각번호 이력 조회")
def get_lot_origin(lotId: str, db: Session = Depends(get_db)):
    """난각번호로 농장(생산지)·사육환경·출고 보류 여부를 조회한다."""
    lot = _get_lot_or_404(db, lotId)

    # 사육환경은 값이 1~4로 고정된 집합이라 코드만 저장하고, 한글 라벨은 enum에서 유도한다.
    rearing_environment = None
    if lot.rearing_environment:
        env = RearingEnvironment(lot.rearing_environment)
        rearing_environment = RearingEnvironmentOut(
            code=env.value,
            name=REARING_ENVIRONMENT_LABELS[env],
        )

    # 농장경영자/소재지는 lot이 아니라 origin(농장)의 속성이라 origins에서 조회한다.
    origin = db.get(Origin, lot.origin_id) if lot.origin_id else None

    return TraceOriginOut(
        lotId=lot.lot_id,
        origin=OriginOut(
            originId=lot.origin_id,
            owner=origin.owner_name if origin else None,
            location=origin.location if origin else None,
        ),
        rearingEnvironment=rearing_environment,
        onHold=lot.on_hold,
    )


@router.patch("/{lotId}/hold", response_model=LotHoldOut, summary="출고 보류 설정/해제")
def set_lot_hold(lotId: str, body: LotHoldRequest, db: Session = Depends(get_db)):
    """lot 출고 보류/보류해제."""
    lot = _get_lot_or_404(db, lotId)
    lot.on_hold = body.onHold
    db.commit()
    db.refresh(lot)
    return LotHoldOut(lotId=lot.lot_id, onHold=lot.on_hold)


@router.get("/{lotId}/quality", response_model=TraceQualityOut, summary="난각번호별 품질 통계")
def get_lot_quality(lotId: str, db: Session = Depends(get_db)):
    """난각번호 기준 품질 통계 - 총검사수/이상수/이상률/주요 이상유형/위험도."""
    _get_lot_or_404(db, lotId)
    return service.get_lot_quality(db, lotId)


@router.get("/{lotId}/events", response_model=TraceEventsOut, summary="난각번호별 이력 타임라인")
def get_lot_events(lotId: str, db: Session = Depends(get_db)):
    """난각번호별 제조·물류 이력 타임라인(순서대로)."""
    _get_lot_or_404(db, lotId)
    events = (
        db.query(LotEvent)
        .filter(LotEvent.lot_id == lotId)
        .order_by(LotEvent.seq.asc())
        .all()
    )
    return TraceEventsOut(
        lotId=lotId,
        events=[
            TraceEventOut(
                seq=e.seq,
                stage=e.stage,
                occurredAt=e.occurred_at,
                label=e.label,
                location=e.location,
                qty=e.qty,
                temperature=e.temperature,
                humidity=e.humidity,
                referenceNo=e.reference_no,
            )
            for e in events
        ],
    )


@router.get("/{lotId}/inspections", response_model=InspectionListOut, summary="난각번호별 검사 계란 조회")
def get_lot_inspections(
    lotId: str,
    page: int = Query(0, ge=0),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=200),
    result: Optional[str] = Query(None, description="DEFECT 지정 시 이상 계란만 조회"),
    db: Session = Depends(get_db),
):
    """
    난각번호별 검사 계란 조회 + 이상 계란만 조회(result=DEFECT)를 겸한다.
    """
    _get_lot_or_404(db, lotId)

    q = db.query(Inspection).filter(Inspection.lot_id == lotId)
    if result == "DEFECT":
        q = q.filter(Inspection.is_defect.is_(True))

    total = q.count()
    records = (
        q.order_by(Inspection.inspected_at.desc())
        .offset(page * size)
        .limit(size)
        .all()
    )

    return InspectionListOut(
        items=inspections_service.to_out_many(db, records),
        page=page,
        size=size,
        totalElements=total,
    )
