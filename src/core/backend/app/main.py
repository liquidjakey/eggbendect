from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_client import Gauge
from prometheus_fastapi_instrumentator import Instrumentator

from app.auth.router import router as auth_router
from app.auth.service import seed_admin_if_empty
from app.config import STORAGE_DIR, STORAGE_URL_PREFIX
from app.database import Base, SessionLocal, engine
from app.inspections.router import router as inspections_router
from app.traceability.router import router as traceability_router
from app.traceability.service import seed_if_empty

app = FastAPI(
    title="Egg Vision AI API",
    version="1.0.0",
    description="계란 품질 검사 AI 백엔드 API.",
    openapi_tags=[
        {"name": "인증", "description": "로그인 (토큰 없이 로그인 성공 여부만 확인)"},
        {"name": "검사", "description": "MONO/COLOR 검사 결과 수집·조회·통계"},
        {"name": "이력관리", "description": "난각번호 기준 이력·품질·출고 보류"},
        {"name": "상태확인", "description": "서버 상태 확인"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(STORAGE_URL_PREFIX, StaticFiles(directory=str(STORAGE_DIR)), name="static")

app.include_router(auth_router)
app.include_router(inspections_router)
app.include_router(traceability_router)

Instrumentator().instrument(app).expose(app, tags=["상태확인"])

# 커넥션 풀이 부하 상황에서 고갈되는 걸 실측한 적이 있어(app/database.py 참고) 그
# 여유가 실제로 지켜지는지 계속 볼 수 있게 노출한다. sqlite(NullPool 등)처럼
# size/overflow 개념이 없는 풀도 있어 없는 지표는 조용히 0으로 둔다.
db_pool_checked_out = Gauge("db_pool_checked_out", "SQLAlchemy 풀에서 현재 사용 중인 커넥션 수")
db_pool_size = Gauge("db_pool_size", "SQLAlchemy 풀의 기본(overflow 제외) 크기")
db_pool_overflow = Gauge("db_pool_overflow", "SQLAlchemy 풀의 현재 overflow 커넥션 수")

db_pool_checked_out.set_function(lambda: getattr(engine.pool, "checkedout", lambda: 0)())
db_pool_size.set_function(lambda: getattr(engine.pool, "size", lambda: 0)())
db_pool_overflow.set_function(lambda: max(getattr(engine.pool, "overflow", lambda: 0)(), 0))


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
        seed_admin_if_empty(db)
    finally:
        db.close()


@app.get("/health", tags=["상태확인"], summary="헬스체크")
def health():
    """서버 상태 확인용 헬스체크."""
    return {"status": "ok"}
