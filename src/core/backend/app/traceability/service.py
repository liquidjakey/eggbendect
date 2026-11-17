import datetime as dt

from sqlalchemy.orm import Session

from app.inspections import service as inspections_service
from app.traceability.model import Lot, LotEvent


def get_lot_quality(db: Session, lot_id: str) -> dict:
    summary = inspections_service.get_summary(db, lot_id=lot_id)
    defects = inspections_service.get_defect_statistics(db, lot_id=lot_id)

    major_defect_type = None
    if defects:
        major_defect_type = max(defects, key=lambda d: d["count"])["type"]

    rate = summary["defectRate"]
    if rate >= 3:
        risk_level = "DANGER"
    elif rate >= 1:
        risk_level = "WARN"
    else:
        risk_level = "SAFE"

    return {
        "lotId": lot_id,
        "totalCount": summary["totalCount"],
        "defectCount": summary["defectCount"],
        "defectRate": summary["defectRate"],
        "majorDefectType": major_defect_type,
        "riskLevel": risk_level,
        "defects": [{"type": d["type"], "count": d["count"]} for d in defects],
    }


# --- 데모 시드 데이터 ---------------------------------------------------------

_LOTS = [
    {"lot_id": "0815M3FDS4"},
    {"lot_id": "0816K8ABC2"},
]

_EVENT_TEMPLATE = [
    ("ORIGIN", "생산지 출하", 0),
    ("WAREHOUSE", "냉장창고 입고", 6),
    ("AI_INSPECTION", "AI 품질 검사", 30),
    ("CUSTOMS", "통관", 48),
    ("OUTBOUND", "출고", 60),
]


def seed_if_empty(db: Session) -> None:
    if db.query(Lot).count() > 0:
        return

    base_time = dt.datetime.utcnow() - dt.timedelta(days=2)

    for lot in _LOTS:
        db.add(Lot(**lot))
        for i, (stage, label, hours_offset) in enumerate(_EVENT_TEMPLATE, start=1):
            db.add(
                LotEvent(
                    lot_id=lot["lot_id"],
                    seq=i,
                    stage=stage,
                    occurred_at=base_time + dt.timedelta(hours=hours_offset),
                    label=label,
                    location=lot.get("location"),
                    qty=120000 if stage == "ORIGIN" else None,
                    temperature=4.0 if stage == "WAREHOUSE" else None,
                    humidity=55.0 if stage == "WAREHOUSE" else None,
                    reference_no=None,
                )
            )

    db.commit()
