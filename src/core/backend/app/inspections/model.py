import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)

from app.database import Base


def utcnow():
    return dt.datetime.utcnow()


class Line(Base):
    """
    검사 라인(LINE-01 등) 마스터. origins에 고정 소속시키지 않는다 - 하나의 물리적
    컨베이어 라인이 여러 농장(origin)의 계란을 번갈아 처리하는 게 정상 도메인이라,
    라인을 특정 농장에 묶으면 실제 운영 방식과 모순된다.

    라인마다 MONO 또는 COLOR 카메라 중 하나만 달려있다 (기획 변경 - 예전엔 한 라인에
    MONO/COLOR가 같이 있어서 같은 계란을 둘 다 찍고 병합했지만, 지금은 라인 자체가
    감지 방식별로 완전히 분리돼 있다). source는 그 라인이 어느 쪽 전용인지를 담는다.
    """

    __tablename__ = "lines"

    line_id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    source = Column(String, nullable=True)  # "MONO" | "COLOR"


class Inspection(Base):
    """
    계란 한 개(egg)에 대한 공통 검사 엔티티. 라인/시간/이미지처럼 소스(MONO/COLOR)와
    무관하게 똑같은 정보 + 조회 편의를 위해 최종 판정(is_defect/defect_type/confidence)을
    비정규화해서 여기 같이 들고 있는다 - 대시보드 집계·목록 조회가 매번
    mono_inspection_results/color_inspection_results까지 조인하지 않아도 되게 하기 위함.

    실제 모델의 원본 분류 결과(class/subClass/confidence)는 이 레코드의 source에 맞는
    mono_inspection_results 또는 color_inspection_results에 1:1로 따로 저장된다 - MONO/COLOR가
    서로 다른 분류 체계를 쓰기 때문(예: MONO만 이물질 세부분류가 있음, 클래스 종류 수도 다름)에
    하나의 컬럼셋으로 억지로 합치지 않는다.

    lot_id/line_id는 lots/lines에 대한 정식 FK다. 캡처 시점에 처음 보는 lot/line이면
    ingest_capture()가 자동으로 마스터 행을 생성(auto-provision)한다 - 사전 등록 없이도
    동작하는 지금의 워크플로우를 유지하면서 참조 무결성도 지키기 위함.
    """

    __tablename__ = "inspections"
    __table_args__ = (
        UniqueConstraint("line_id", "capture_id", "row", "col", name="uq_capture_cell"),
    )

    inspection_id = Column(Integer, primary_key=True, autoincrement=True)
    egg_id = Column(String, unique=True, index=True, nullable=False)

    lot_id = Column(String, ForeignKey("lots.lot_id"), index=True, nullable=False)
    line_id = Column(String, ForeignKey("lines.line_id"), index=True, nullable=False)
    capture_id = Column(String, index=True, nullable=False)
    row = Column(Integer, nullable=False)
    col = Column(Integer, nullable=False)

    source = Column(String, nullable=False)  # "MONO" | "COLOR" - mono/color_inspection_results 중 어느 쪽을 봐야 하는지
    is_defect = Column(Boolean, default=False, nullable=False)
    defect_type = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)

    image_url = Column(String, nullable=True)

    inspected_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class MonoInspectionResult(Base):
    """MONO 모델의 원본 분류 결과. inspections와 1:1(inspection_id가 PK이자 FK).

    클래스 종류/이물질 세부분류(sub_class) 값 목록은 아직 확정 전이라 여기서는
    문자열로만 받아둔다 - 확정되면 shared/enums.py에 정식 enum 추가하고 검증 붙이면 됨.
    """

    __tablename__ = "mono_inspection_results"

    inspection_id = Column(Integer, ForeignKey("inspections.inspection_id", ondelete="CASCADE"), primary_key=True)
    class_ = Column("class", String, nullable=False)
    sub_class = Column(String, nullable=True)  # FOREIGN_MATERIAL일 때만 채워짐 (MONO 전용 세부분류)
    confidence = Column(Float, nullable=False)


class ColorInspectionResult(Base):
    """COLOR 모델의 원본 분류 결과. inspections와 1:1(inspection_id가 PK이자 FK).
    COLOR는 이물질 세부분류가 없다 - sub_class 컬럼 자체가 없음."""

    __tablename__ = "color_inspection_results"

    inspection_id = Column(Integer, ForeignKey("inspections.inspection_id", ondelete="CASCADE"), primary_key=True)
    class_ = Column("class", String, nullable=False)
    confidence = Column(Float, nullable=False)
