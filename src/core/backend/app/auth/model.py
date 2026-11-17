from sqlalchemy import Column, String

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)  # 프론트 사이드바 표시용 (예: "김검사")
    department = Column(String, nullable=True)  # 프론트 사이드바 표시용 (예: "A동 검사관")
