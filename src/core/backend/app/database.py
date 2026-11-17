from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

# SQLite는 커넥션당 스레드 제약이 있어 check_same_thread=False가 필요하지만,
# Postgres 등 다른 드라이버는 이 옵션을 모르므로 sqlite일 때만 넘긴다.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# 기본 풀(pool_size=5, max_overflow=10 = 총 15개)이 부하 상황에서 금방
# 고갈돼 요청이 전부 막히는 걸 실측함 - 여유를 더 준다. (SQLite는 풀 개념이
# 달라 이 옵션들을 모르므로 Postgres 등에서만 적용.)
pool_kwargs = {} if DATABASE_URL.startswith("sqlite") else {"pool_size": 20, "max_overflow": 30}

engine = create_engine(DATABASE_URL, connect_args=connect_args, **pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
