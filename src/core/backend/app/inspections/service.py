"""
inspections 도메인 서비스 로직.

1) ingest_capture(): 라인(MONO 전용 또는 COLOR 전용)에서 온 결과를 계란 한 개 단위로 저장
2) get_summary/get_defect_statistics/get_line_statistics/get_recent_defects: 통계 집계
3) to_out(): Inspection ORM -> InspectionOut 응답 스키마 변환 (traceability 도메인에서도 재사용)

라인은 MONO 또는 COLOR 카메라 중 하나만 달려있어(Line.source) 한 계란은 항상 단일
소스에서만 판정이 온다 - 예전엔 한 라인에 MONO/COLOR가 같이 있어서 병합 규칙이
필요했지만, 지금은 그럴 필요가 없다.
"""

import datetime as dt
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.inspections.model import ColorInspectionResult, Inspection, Line, MonoInspectionResult
from app.inspections.schema import EggGridResult, HourlyStat, InspectionIngestRequest, InspectionOut
from app.shared.enums import Source
from app.traceability.model import Lot, Origin


# --- 수집 --------------------------------------------------------------------

def _find_record(db: Session, payload: InspectionIngestRequest, egg: EggGridResult) -> Optional[Inspection]:
    """FOR UPDATE로 행 잠금 - 같은 (line, captureId, row, col)이 재전송(재시도)돼도
    안전하게 덮어쓰기 위함."""
    return (
        db.query(Inspection)
        .filter(
            Inspection.line_id == payload.lineId,
            Inspection.capture_id == payload.captureId,
            Inspection.row == egg.row,
            Inspection.col == egg.col,
        )
        .with_for_update()
        .one_or_none()
    )


def _apply_common(record: Inspection, payload: InspectionIngestRequest, egg: EggGridResult) -> None:
    """소스와 무관한 공통 필드 + 조회 편의를 위한 비정규화 판정 필드."""
    record.source = payload.source.value
    record.is_defect = egg.class_.value != "NORMAL"
    record.defect_type = egg.class_.value if record.is_defect else None
    record.confidence = egg.confidence


def _upsert_result_detail(db: Session, inspection_id: int, payload: InspectionIngestRequest, egg: EggGridResult) -> None:
    """MONO/COLOR 원본 분류 결과를 그 소스에 맞는 결과 테이블(inspection_id 1:1)에 upsert."""
    if payload.source == Source.MONO:
        detail = db.get(MonoInspectionResult, inspection_id) or MonoInspectionResult(inspection_id=inspection_id)
        detail.class_ = egg.class_.value
        detail.sub_class = egg.subClass
        detail.confidence = egg.confidence
    else:
        detail = db.get(ColorInspectionResult, inspection_id) or ColorInspectionResult(inspection_id=inspection_id)
        detail.class_ = egg.class_.value
        detail.confidence = egg.confidence
    db.add(detail)


def _upsert_one(db: Session, payload: InspectionIngestRequest, egg: EggGridResult) -> Inspection:
    """
    같은 (line, captureId, row, col)로 정말 동시에 재전송이 오면 둘 다 '기존 레코드
    없음'으로 보고 동시에 INSERT를 시도해 UNIQUE 제약 충돌이 날 수 있다. flush가
    실패하면 롤백 후 다시 조회해서 UPDATE로 전환한다.
    """
    record = _find_record(db, payload, egg)

    if record is None:
        egg_id = f"{payload.lineId}-{payload.captureId}-R{egg.row}C{egg.col}"
        record = Inspection(
            egg_id=egg_id,
            lot_id=payload.lotId,
            line_id=payload.lineId,
            capture_id=payload.captureId,
            row=egg.row,
            col=egg.col,
        )
        _apply_common(record, payload, egg)  # source 등 NOT NULL 컬럼을 flush 전에 채워야 함
        db.add(record)
        try:
            db.flush()  # mono/color_inspection_results가 FK로 참조할 inspection_id 확보 (커밋 전)
        except IntegrityError:
            db.rollback()
            record = _find_record(db, payload, egg)
            if record is None:
                raise
            _apply_common(record, payload, egg)  # 동시 삽입 경합으로 넘겨받은 기존 레코드 - 아직 이번 값이 안 채워져 있다
    else:
        _apply_common(record, payload, egg)

    _upsert_result_detail(db, record.inspection_id, payload, egg)
    return record


def _ensure_lot_exists(db: Session, lot_id: str) -> None:
    """
    lot_id는 lots에 대한 정식 FK라, 캡처가 사전 등록 없이도 들어올 수 있는 지금
    워크플로우를 지키려면 처음 보는 값이면 마스터 행을 자동 생성해야 한다. 동시에
    같은 새 값이 들어와 INSERT가 충돌해도(레이스 컨디션) 무시하고 넘어간다 - 누가
    먼저 만들었든 그 시점부터 FK만 성립하면 된다.
    """
    if db.get(Lot, lot_id) is not None:
        return
    db.add(Lot(lot_id=lot_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def _ensure_line_exists(db: Session, line_id: str, source: str) -> None:
    """라인도 lot과 같은 이유로 자동 생성한다. 처음 보는 라인이면 이 캡처의
    source로 고정(그 라인은 그 뒤로 계속 같은 소스 전용)한다.

    이미 있는 라인이면 이번 캡처의 source가 그 라인에 고정된 source와 같은지
    확인한다 - 안 그러면(장비 설정 실수 등으로 다른 source가 같은 lineId로
    들어오면) 한 line_id에 MONO/COLOR 데이터가 섞여 line-statistics 등 라인별
    집계가 조용히 틀어진다."""
    line = db.get(Line, line_id)
    if line is not None:
        if line.source != source:
            raise ValueError(
                f"라인 '{line_id}'은 이미 {line.source} 전용으로 등록돼 있습니다 (받은 source: {source})"
            )
        return
    db.add(Line(line_id=line_id, source=source))
    try:
        db.commit()
    except IntegrityError:
        # 동시에 같은 새 lineId로 서로 다른 source가 들어와 경합한 경우 - 롤백만
        # 하고 넘어가면 이긴 쪽 source가 뭔지 확인을 안 해서, 방금 위에서 하려던
        # source 검증을 그냥 건너뛰게 된다. 다시 조회해서 같은 검증을 한 번 더 한다.
        db.rollback()
        line = db.get(Line, line_id)
        if line is not None and line.source != source:
            raise ValueError(
                f"라인 '{line_id}'은 이미 {line.source} 전용으로 등록돼 있습니다 (받은 source: {source})"
            )


def ingest_capture(db: Session, payload: InspectionIngestRequest) -> list[Inspection]:
    _ensure_lot_exists(db, payload.lotId)
    _ensure_line_exists(db, payload.lineId, payload.source.value)
    # One tray commits once for the whole batch instead of once per egg - each
    # commit is a fsync round trip to Postgres, and 12 of those per tray
    # (measured ~255ms) dwarfed the actual GPU inference time (~30ms) for the
    # same request. `_upsert_one` still flushes per egg (needed to get each
    # inspection_id before its result-detail row can reference it as a FK),
    # just doesn't commit until every egg in the tray has been staged.
    records = [_upsert_one(db, payload, egg) for egg in payload.eggs]
    db.commit()
    for record in records:
        db.refresh(record)
    return records


def ingest_captures_batch(db: Session, payloads: list[InspectionIngestRequest]) -> list[list[Inspection]]:
    """ingest_capture()의 다건(多件) 버전 - Kafka 컨슈머가 토픽에서 한 번에 꺼낸
    여러 트레이(캡처)를 트레이당 commit이 아니라 배치 전체에 commit 한 번으로
    묶는다. 반환값은 payloads와 같은 순서의 트레이별 Inspection 리스트."""
    per_tray_records: list[list[Inspection]] = []
    for payload in payloads:
        _ensure_lot_exists(db, payload.lotId)
        _ensure_line_exists(db, payload.lineId, payload.source.value)
        per_tray_records.append([_upsert_one(db, payload, egg) for egg in payload.eggs])
    db.commit()
    for records in per_tray_records:
        for record in records:
            db.refresh(record)
    return per_tray_records


# --- 응답 변환 ---------------------------------------------------------------

def _fetch_sub_classes(db: Session, records: list[Inspection]) -> dict[int, Optional[str]]:
    """records 중 MONO+FOREIGN_MATERIAL인 것만 골라 sub_class를 쿼리 한 번으로
    모아온다 - to_out_many()가 목록/스냅샷 전체를 한 번에 변환할 때 건마다 따로
    쿼리가 나가는(N+1) 걸 막기 위함."""
    ids = [r.inspection_id for r in records if r.source == "MONO" and r.defect_type == "FOREIGN_MATERIAL"]
    if not ids:
        return {}
    rows = (
        db.query(MonoInspectionResult.inspection_id, MonoInspectionResult.sub_class)
        .filter(MonoInspectionResult.inspection_id.in_(ids))
        .all()
    )
    return dict(rows)


def to_out(record: Inspection, sub_class: Optional[str] = None) -> InspectionOut:
    return InspectionOut(
        inspectionId=record.inspection_id,
        eggId=record.egg_id,
        lotId=record.lot_id,
        lineId=record.line_id,
        row=record.row,
        col=record.col,
        source=record.source,
        isDefect=record.is_defect,
        defectType=record.defect_type,
        subClass=sub_class,
        confidence=record.confidence,
        imageUrl=record.image_url,
        inspectedAt=record.inspected_at,
    )


def to_out_many(db: Session, records: list[Inspection]) -> list[InspectionOut]:
    """목록/스냅샷 응답용 - subClass를 쿼리 한 번으로 모아온 뒤 각 레코드를 변환한다."""
    sub_classes = _fetch_sub_classes(db, records)
    return [to_out(r, sub_classes.get(r.inspection_id)) for r in records]


# --- 통계 --------------------------------------------------------------------

def _rate(part: int, total: int) -> float:
    if total == 0:
        return 0.0
    return round(part / total * 100, 2)


def _apply_date_range(q, start_date: Optional[dt.date], end_date: Optional[dt.date]):
    if start_date:
        q = q.filter(Inspection.inspected_at >= dt.datetime.combine(start_date, dt.time.min))
    if end_date:
        q = q.filter(Inspection.inspected_at <= dt.datetime.combine(end_date, dt.time.max))
    return q


def get_summary(
    db: Session,
    lot_id: Optional[str] = None,
    start_date: Optional[dt.date] = None,
    end_date: Optional[dt.date] = None,
) -> dict:
    q = db.query(Inspection)
    if lot_id:
        q = q.filter(Inspection.lot_id == lot_id)
    q = _apply_date_range(q, start_date, end_date)

    total = q.count()
    defect = q.filter(Inspection.is_defect.is_(True)).count()
    normal = total - defect
    crack = q.filter(Inspection.defect_type == "CRACK").count()

    return {
        "totalCount": total,
        "normalCount": normal,
        "defectCount": defect,
        "defectRate": _rate(defect, total),
        "crackCount": crack,
    }


def get_today_trend(db: Session) -> dict:
    """
    오늘 지금까지 누적 검사량을 어제 같은 시각까지의 누적량과 비교한다.
    당일이 아직 안 끝난 상태에서 어제 하루 전체(24시간)와 비교하면 구간 길이가
    달라 불공평하므로, 어제도 오늘과 똑같이 00:00부터 "지금과 같은 시:분:초"까지만
    잘라서 비교한다.
    """
    now = dt.datetime.utcnow()
    today_start = dt.datetime.combine(now.date(), dt.time.min)
    yesterday_start = today_start - dt.timedelta(days=1)
    yesterday_same_time = now - dt.timedelta(days=1)

    today_count = (
        db.query(Inspection)
        .filter(Inspection.inspected_at >= today_start, Inspection.inspected_at <= now)
        .count()
    )
    yesterday_count = (
        db.query(Inspection)
        .filter(Inspection.inspected_at >= yesterday_start, Inspection.inspected_at <= yesterday_same_time)
        .count()
    )

    change_rate = None
    if yesterday_count > 0:
        change_rate = round((today_count - yesterday_count) / yesterday_count * 100, 1)

    return {
        "todayCount": today_count,
        "yesterdaySameTimeCount": yesterday_count,
        "changeRate": change_rate,
    }


def get_defect_statistics(
    db: Session,
    lot_id: Optional[str] = None,
    start_date: Optional[dt.date] = None,
    end_date: Optional[dt.date] = None,
) -> list[dict]:
    q = db.query(Inspection).filter(Inspection.is_defect.is_(True))
    if lot_id:
        q = q.filter(Inspection.lot_id == lot_id)
    q = _apply_date_range(q, start_date, end_date)

    total_inspected_q = db.query(Inspection)
    if lot_id:
        total_inspected_q = total_inspected_q.filter(Inspection.lot_id == lot_id)
    total_inspected_q = _apply_date_range(total_inspected_q, start_date, end_date)
    total = total_inspected_q.count()

    rows = (
        q.with_entities(Inspection.defect_type, func.count(Inspection.inspection_id))
        .group_by(Inspection.defect_type)
        .all()
    )
    return [
        {"type": defect_type, "count": count, "rate": _rate(count, total)}
        for defect_type, count in rows
        if defect_type is not None
    ]


def get_line_statistics(
    db: Session,
    start_date: Optional[dt.date] = None,
    end_date: Optional[dt.date] = None,
) -> list[dict]:
    base = _apply_date_range(db.query(Inspection), start_date, end_date)
    rows = (
        base.with_entities(
            Inspection.line_id,
            Inspection.source,
            func.count(Inspection.inspection_id),
            func.max(Inspection.inspected_at),
        )
        .group_by(Inspection.line_id, Inspection.source)
        .all()
    )

    result = []
    for line_id, source, total, last_inspected_at in rows:
        # line_id만이 아니라 source까지 같이 걸러야 한다 - 그룹은 (line_id, source)
        # 단위인데 이 필터가 line_id만 보면, 한 line_id에 두 source가 섞여 있을 때
        # (정상 흐름에선 없어야 하지만 _ensure_line_exists가 막기 전엔 가능했다)
        # 두 그룹 다 합산된 같은 defect_count를 보고하게 된다.
        type_counts = dict(
            _apply_date_range(
                db.query(Inspection.defect_type, func.count(Inspection.inspection_id))
                .filter(
                    Inspection.line_id == line_id,
                    Inspection.source == source,
                    Inspection.is_defect.is_(True),
                ),
                start_date,
                end_date,
            )
            .group_by(Inspection.defect_type)
            .all()
        )
        # is_defect=True인 행은 _apply_common이 항상 defect_type도 같이 채우므로
        # (동시에 nullable로 두는 경우가 없음), 유형별 합이 곧 전체 이상 건수다 -
        # 똑같은 필터로 count() 쿼리를 한 번 더 안 날려도 된다.
        defect_count = sum(type_counts.values())
        result.append(
            {
                "lineId": line_id,
                "source": source,
                "totalCount": total,
                "defectCount": defect_count,
                "defectRate": _rate(defect_count, total),
                "foreignMaterialCount": type_counts.get("FOREIGN_MATERIAL", 0),
                "discolorationCount": type_counts.get("DISCOLORATION", 0),
                "bloodSpotCount": type_counts.get("BLOOD_SPOT", 0),
                "crackCount": type_counts.get("CRACK", 0),
                "deformedCount": type_counts.get("DEFORMED", 0),
                "lastInspectedAt": last_inspected_at,
            }
        )
    return result


def get_origin_statistics(
    db: Session,
    start_date: Optional[dt.date] = None,
    end_date: Optional[dt.date] = None,
) -> list[dict]:
    """농장(생산지, Origin)별 검사수/이상수/이상률.

    검사 레코드엔 농장 정보가 직접 없어 Inspection.lot_id -> Lot.origin_id로
    이어 조회한다. origin_id가 없는 lot(_ensure_lot_exists가 만든 빈 lot 등)은
    어느 농장 소속인지 알 수 없으므로 집계에서 제외한다.
    """
    base = (
        _apply_date_range(db.query(Inspection), start_date, end_date)
        .join(Lot, Inspection.lot_id == Lot.lot_id)
        .filter(Lot.origin_id.isnot(None))
    )
    rows = (
        base.with_entities(
            Lot.origin_id,
            func.count(Inspection.inspection_id),
            func.sum(case((Inspection.is_defect.is_(True), 1), else_=0)),
        )
        .group_by(Lot.origin_id)
        .all()
    )

    origins = {o.origin_id: o for o in db.query(Origin).all()}

    result = []
    for origin_id, total, defect_count in rows:
        origin = origins.get(origin_id)
        result.append(
            {
                "originId": origin_id,
                "owner": origin.owner_name if origin else None,
                "location": origin.location if origin else None,
                "totalCount": total,
                "defectCount": defect_count,
                "defectRate": _rate(defect_count, total),
            }
        )
    result.sort(key=lambda r: r["defectRate"], reverse=True)
    return result


DEFAULT_ALERT_THRESHOLD = 2.0  # % — 이상률이 이 값을 넘는 라인을 대시보드 배너로 알린다.


def get_alerts(
    db: Session,
    threshold: float = DEFAULT_ALERT_THRESHOLD,
    start_date: Optional[dt.date] = None,
    end_date: Optional[dt.date] = None,
) -> list[dict]:
    """관리 기준 이상률을 초과한 라인만 골라낸다 - line-statistics를 재사용."""
    lines = get_line_statistics(db, start_date=start_date, end_date=end_date)
    return [
        {"lineId": line["lineId"], "defectRate": line["defectRate"]}
        for line in lines
        if line["defectRate"] > threshold
    ]


def current_max_inspection_id(db: Session) -> int:
    """가장 최근에 들어온 검사 레코드의 id. /inspections/stream이 폴링 사이에
    새 데이터가 있었는지 값싸게(인덱스 스캔) 판단하는 용도."""
    return db.query(func.max(Inspection.inspection_id)).scalar() or 0


DETECTIONS_STREAM_LIMIT = 200


def build_live_snapshot(db: Session, threshold: float = DEFAULT_ALERT_THRESHOLD) -> dict:
    """대시보드가 필요로 하는 걸 한 번에 묶어서 반환 - /inspections/stream이
    폴링 사이에 뭔가 바뀌었을 때마다 이 스냅샷 전체를 클라이언트로 밀어준다."""
    recent = (
        db.query(Inspection)
        .order_by(Inspection.inspected_at.desc())
        .limit(DETECTIONS_STREAM_LIMIT)
        .all()
    )
    return {
        "lines": get_line_statistics(db),
        # get_hourly_statistics() returns raw dicts with a datetime `hour` -
        # not JSON-serializable as-is, so route it through the same
        # HourlyStat schema the plain REST endpoint uses.
        "hours": [HourlyStat(**r).model_dump(mode="json") for r in get_hourly_statistics(db)],
        "alerts": get_alerts(db, threshold=threshold),
        "inspections": [o.model_dump(by_alias=True, mode="json") for o in to_out_many(db, recent)],
    }


def get_recent_defects(db: Session, limit: int = 5) -> list[Inspection]:
    return (
        db.query(Inspection)
        .filter(Inspection.is_defect.is_(True))
        .order_by(Inspection.inspected_at.desc())
        .limit(limit)
        .all()
    )


def get_hourly_statistics(db: Session, date: Optional[dt.date] = None) -> list[dict]:
    """
    지정한 날짜(기본값: 오늘) 00시~23시, 1시간 단위 검사량. 대시보드 차트용.
    데이터가 없는 시간대도 0건으로 채워서 반환한다 (차트에서 빈 시간이 사라지지 않도록).
    다른 통계 엔드포인트(summary/defect-statistics/line-statistics)와 동일하게
    "하루" 단위로 필터링 방식을 맞췄다 - "최근 N시간" 방식은 쓰지 않는다.
    """
    target_date = date or dt.datetime.utcnow().date()
    day_start = dt.datetime.combine(target_date, dt.time.min)
    day_end = day_start + dt.timedelta(days=1)

    hour_bucket = func.date_trunc("hour", Inspection.inspected_at)
    rows = (
        db.query(hour_bucket, func.count(Inspection.inspection_id))
        .filter(Inspection.inspected_at >= day_start, Inspection.inspected_at < day_end)
        .group_by(hour_bucket)
        .all()
    )
    counts_by_hour = {bucket.replace(tzinfo=None): count for bucket, count in rows}

    result = []
    for i in range(24):
        hour_start = day_start + dt.timedelta(hours=i)
        result.append({"hour": hour_start, "count": counts_by_hour.get(hour_start, 0)})
    return result
