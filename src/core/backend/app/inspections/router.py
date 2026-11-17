import asyncio
import datetime as dt
import json
from typing import Optional

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import DEFAULT_PAGE_SIZE
from app.database import SessionLocal, get_db
from app.inspections import service
from app.inspections.model import Inspection
from app.inspections.schema import (
    AlertsOut,
    DefectStatisticsOut,
    HourlyStat,
    HourlyStatisticsOut,
    ImageUploadOut,
    InspectionIngestRequest,
    InspectionListOut,
    InspectionOut,
    LineAlert,
    LineStatisticsOut,
    OriginStatisticsOut,
    RecentDefectItem,
    RecentDefectsOut,
    SummaryOut,
    TodayTrendOut,
)
from app.shared.enums import DefectType
from app.storage import save_image

router = APIRouter(prefix="/inspections", tags=["검사"])


@router.post("", response_model=list[InspectionOut], summary="검사 결과 수집(MONO/COLOR)")
def ingest_inspection(body: InspectionIngestRequest, db: Session = Depends(get_db)):
    """MONO 전용 또는 COLOR 전용 라인에서 온 결과를 계란별 레코드로 저장한다.
    라인 장비(ai_server)가 보내는 기계 간 호출이라 사용자 인증 대상이 아니다."""
    try:
        records = service.ingest_capture(db, body)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return service.to_out_many(db, records)


_DATE_RANGE_DOC = "지정하지 않으면 전체 기간 집계."


@router.get("/summary", response_model=SummaryOut, summary="검사 요약 통계")
def get_summary(
    startDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    endDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    db: Session = Depends(get_db),
):
    """대시보드 상단 요약 - 총 검사수/정상/이상/이상률/크랙 수."""
    return service.get_summary(db, start_date=startDate, end_date=endDate)


@router.get("/today-trend", response_model=TodayTrendOut, summary="오늘 누적 검사량의 전일 동시간 대비 증감률")
def get_today_trend(db: Session = Depends(get_db)):
    """오늘 00:00부터 지금까지 누적 검사량을, 어제 00:00부터 어제의 같은 시각까지
    누적됐던 검사량과 비교한 증감률. 어제 데이터가 없으면 changeRate는 null."""
    return service.get_today_trend(db)


@router.get("/defect-statistics", response_model=DefectStatisticsOut, summary="이상 유형별 통계")
def get_defect_statistics(
    startDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    endDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    db: Session = Depends(get_db),
):
    """이상 유형(크랙/혈반/이물질/탈색/기형)별 건수·비율."""
    return DefectStatisticsOut(defects=service.get_defect_statistics(db, start_date=startDate, end_date=endDate))


@router.get("/line-statistics", response_model=LineStatisticsOut, summary="라인별 통계")
def get_line_statistics(
    startDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    endDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    db: Session = Depends(get_db),
):
    """생산 라인별 총 검사수/이상수/이상률 + 이상 유형별 세부 건수."""
    return LineStatisticsOut(lines=service.get_line_statistics(db, start_date=startDate, end_date=endDate))


@router.get("/origin-statistics", response_model=OriginStatisticsOut, summary="농장별 통계")
def get_origin_statistics(
    startDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    endDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    db: Session = Depends(get_db),
):
    """농장(생산지)별 총 검사수/이상수/이상률 - 이상률 높은 순 정렬."""
    return OriginStatisticsOut(origins=service.get_origin_statistics(db, start_date=startDate, end_date=endDate))


@router.get("/hourly-statistics", response_model=HourlyStatisticsOut, summary="시간대별 검사량 통계")
def get_hourly_statistics(
    date: Optional[dt.date] = Query(None, description="기본값: 오늘. 해당 날짜 00~23시 1시간 단위 검사량."),
    db: Session = Depends(get_db),
):
    """대시보드 차트용 - 지정 날짜(기본 오늘) 1시간 단위 검사량."""
    rows = service.get_hourly_statistics(db, date=date)
    return HourlyStatisticsOut(hours=[HourlyStat(**r) for r in rows])


@router.get("/alerts", response_model=AlertsOut, summary="이상률 초과 라인 알림")
def get_alerts(
    threshold: float = Query(service.DEFAULT_ALERT_THRESHOLD, description="이 값(%)을 초과하는 라인만 반환"),
    startDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    endDate: Optional[dt.date] = Query(None, description=_DATE_RANGE_DOC),
    db: Session = Depends(get_db),
):
    """대시보드 상단 배너용 - 관리 기준 이상률을 초과한 라인 목록 (line-statistics 기반)."""
    lines = service.get_alerts(db, threshold=threshold, start_date=startDate, end_date=endDate)
    return AlertsOut(threshold=threshold, lines=[LineAlert(**line) for line in lines])


_STREAM_POLL_SECONDS = 1.0


@router.get("/stream", summary="대시보드 실시간 업데이트 스트림")
async def stream_updates(threshold: float = Query(service.DEFAULT_ALERT_THRESHOLD)):
    """
    1초마다 최신 inspection_id를 값싸게 확인하고, 폴링 사이에 새 데이터가 들어온
    경우에만 스냅샷(라인 통계/시간대별/알림/최근 검사 목록) 전체를 이벤트로
    밀어준다 - 클라이언트가 매번 여러 엔드포인트를 다시 조회할 필요가 없다.
    아무것도 안 바뀌면 커넥션이 유휴 상태로 오래 있다가 리버스 프록시에 끊기지
    않도록 주석(:) 라인으로 하트비트만 보낸다.
    """

    async def event_generator():
        last_max_id: Optional[int] = None
        while True:
            db = SessionLocal()
            try:
                max_id = await anyio.to_thread.run_sync(service.current_max_inspection_id, db)
                if max_id != last_max_id:
                    last_max_id = max_id
                    snapshot = await anyio.to_thread.run_sync(service.build_live_snapshot, db, threshold)
                    yield f"data: {json.dumps(snapshot)}\n\n"
                else:
                    yield ": ping\n\n"
            finally:
                db.close()
            await asyncio.sleep(_STREAM_POLL_SECONDS)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/recent-defects", response_model=RecentDefectsOut, summary="최근 이상 계란 목록")
def get_recent_defects(limit: int = Query(5, ge=1, le=100), db: Session = Depends(get_db)):
    """최근 발생한 이상 계란 목록(최신순)."""
    records = service.get_recent_defects(db, limit=limit)
    items = [
        RecentDefectItem(
            inspectionId=r.inspection_id,
            eggId=r.egg_id,
            lineId=r.line_id,
            defectType=r.defect_type,
            confidence=r.confidence,
            inspectedAt=r.inspected_at,
        )
        for r in records
    ]
    return RecentDefectsOut(items=items)


@router.get("", response_model=InspectionListOut, summary="검사 계란 목록/필터 조회")
def list_inspections(
    page: int = Query(0, ge=0),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=200),
    lineId: Optional[str] = None,
    isDefect: Optional[bool] = None,
    defectType: Optional[DefectType] = None,
    startDate: Optional[dt.date] = Query(None, description="이 날짜 00:00부터(포함). 하루만 보려면 endDate와 동일하게."),
    endDate: Optional[dt.date] = Query(None, description="이 날짜 23:59:59까지(포함)."),
    db: Session = Depends(get_db),
):
    """
    검사 계란 목록 조회 + 필터 조회를 겸한다.
    (생산라인/정상-이상 여부/이상 유형/날짜 범위 필터 지원)
    """
    q = db.query(Inspection)
    if lineId:
        q = q.filter(Inspection.line_id == lineId)
    if isDefect is not None:
        q = q.filter(Inspection.is_defect.is_(isDefect))
    if defectType:
        q = q.filter(Inspection.defect_type == defectType.value)
    if startDate:
        q = q.filter(Inspection.inspected_at >= dt.datetime.combine(startDate, dt.time.min))
    if endDate:
        q = q.filter(Inspection.inspected_at <= dt.datetime.combine(endDate, dt.time.max))

    total = q.count()
    records = (
        q.order_by(Inspection.inspected_at.desc())
        .offset(page * size)
        .limit(size)
        .all()
    )

    return InspectionListOut(
        items=service.to_out_many(db, records),
        page=page,
        size=size,
        totalElements=total,
    )


@router.get("/{inspectionId}", response_model=InspectionOut, summary="검사 계란 상세 조회")
def get_inspection(inspectionId: int, db: Session = Depends(get_db)):
    """검사 계란 상세 조회 - 소스(MONO/COLOR)·판정·이미지 URL 포함."""
    record = db.get(Inspection, inspectionId)
    if record is None:
        raise HTTPException(status_code=404, detail="검사 계란을 찾을 수 없습니다.")
    return service.to_out_many(db, [record])[0]


@router.post("/{inspectionId}/images", response_model=ImageUploadOut, summary="검사 계란 이미지 업로드")
def upload_inspection_image(inspectionId: int, image: UploadFile):
    """
    ai_server가 크롭한 이미지를 자동 업로드하는 기계 간 호출이라 사용자 인증 대상이 아니다
    (POST /inspections 수집 엔드포인트와 동일한 이유).
    이미지를 로컬 S3-흉내 저장소에 업로드하고 URL을 레코드에 반영한다.
    AI 결과 페이로드에는 이미지가 없기 때문에 별도로 붙이는 확장 엔드포인트.

    디스크에 파일을 쓰는 동안(save_image, 느릴 수 있음) DB 커넥션을 붙잡고
    있으면 동시 요청이 몰릴 때 커넥션 풀이 금방 고갈된다(실측) - 그래서
    egg_id 조회 -> 파일 저장 -> image_url 갱신을 짧은 세션 두 개로 나눠서,
    느린 파일 쓰기 구간에는 커넥션을 쥐고 있지 않게 한다.
    """
    db = SessionLocal()
    try:
        record = db.get(Inspection, inspectionId)
        if record is None:
            raise HTTPException(status_code=404, detail="검사 계란을 찾을 수 없습니다.")
        egg_id = record.egg_id
    finally:
        db.close()

    image_url = save_image(image, key_prefix=egg_id)

    db = SessionLocal()
    try:
        record = db.get(Inspection, inspectionId)
        record.image_url = image_url
        db.commit()
    finally:
        db.close()

    return ImageUploadOut(inspectionId=inspectionId, imageUrl=image_url)


@router.post("/images/batch", response_model=list[ImageUploadOut], summary="검사 계란 이미지 일괄 업로드")
def upload_inspection_images_batch(
    inspectionIds: list[int] = Form(...),
    images: list[UploadFile] = File(...),
):
    """
    트레이 사진 한 장에서 나온 계란 크롭 이미지 여러 개를 요청 한 번으로 업로드한다
    (ai_server가 트레이당 계란 수만큼 이미지 업로드를 따로 호출하던 걸 한 번으로 묶음).
    inspectionIds[i]가 images[i]에 대응한다 - 같은 순서로 보내야 한다. 존재하지 않는
    inspectionId는 조용히 건너뛴다(트레이 안 일부 계란만 실패해도 나머지는 저장되도록).

    single-image 업로드와 같은 이유로, N장을 디스크에 쓰는 느린 구간에는 DB
    커넥션을 붙잡지 않도록 조회 -> 저장 -> 갱신을 짧은 세션 두 개로 나눈다.
    """
    if len(inspectionIds) != len(images):
        raise HTTPException(
            status_code=400, detail="inspectionIds와 images 개수가 일치해야 합니다."
        )

    db = SessionLocal()
    try:
        records = db.query(Inspection).filter(Inspection.inspection_id.in_(inspectionIds)).all()
        egg_id_by_id = {r.inspection_id: r.egg_id for r in records}
    finally:
        db.close()

    saved_urls: dict[int, str] = {}
    for inspection_id, image in zip(inspectionIds, images):
        egg_id = egg_id_by_id.get(inspection_id)
        if egg_id is None:
            continue
        saved_urls[inspection_id] = save_image(image, key_prefix=egg_id)

    db = SessionLocal()
    try:
        results = []
        for inspection_id, url in saved_urls.items():
            record = db.get(Inspection, inspection_id)
            record.image_url = url
            results.append(ImageUploadOut(inspectionId=inspection_id, imageUrl=url))
        db.commit()
    finally:
        db.close()

    return results
