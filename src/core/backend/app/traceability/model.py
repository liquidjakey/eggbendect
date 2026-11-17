from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String

from app.database import Base


class Origin(Base):
    """농장(생산지) 마스터. 농장경영자/소재지는 lot이 아니라 농장 자체의 속성이라 분리."""

    __tablename__ = "origins"

    origin_id = Column(String, primary_key=True)
    owner_name = Column(String, nullable=True)
    location = Column(String, nullable=True)


class Lot(Base):
    """난각번호(lot) 기준 정적 이력 정보 (AI 페이로드에는 없는 정보라 시드/등록 시 채움)."""

    __tablename__ = "lots"

    lot_id = Column(String, primary_key=True)
    origin_id = Column(String, ForeignKey("origins.origin_id"), nullable=True, index=True)
    rearing_environment = Column(String, nullable=True)  # 사육환경, RearingEnvironment 값("1"~"4")
    on_hold = Column(Boolean, default=False, nullable=False)
    # line_id는 lot 고정 속성이 아니다 - 실제 라인 정보는 inspections.line_id에 캡처 시점마다
    # 정확히 기록되므로(한 lot이 여러 라인에 걸쳐 검사될 수 있음) 여기 중복 저장하지 않는다.
    # warehouse는 별도 엔티티가 필요 없다고 판단해 제거함.


class LotEvent(Base):
    """난각번호별 제조·물류 이력 타임라인."""

    __tablename__ = "lot_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(String, ForeignKey("lots.lot_id"), index=True, nullable=False)
    seq = Column(Integer, nullable=False)
    stage = Column(String, nullable=False)
    occurred_at = Column(DateTime, nullable=False)
    label = Column(String, nullable=False)
    location = Column(String, nullable=True)
    qty = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    reference_no = Column(String, nullable=True)
