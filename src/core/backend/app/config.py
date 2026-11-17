import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv(
    "EGGVISION_DATABASE_URL",
    "postgresql+psycopg://eggvision:eggvision@localhost:5432/eggvision",
)

STORAGE_DIR = Path(os.getenv("EGGVISION_STORAGE_DIR", str(BASE_DIR / "storage")))
STORAGE_URL_PREFIX = "/static"

# 목업 로그인 계정 (실제 인증/JWT 없음)
ADMIN_EMAIL = os.getenv("EGGVISION_ADMIN_EMAIL", "admin@test.com")
ADMIN_PASSWORD = os.getenv("EGGVISION_ADMIN_PASSWORD", "1234")

DEFAULT_PAGE_SIZE = 20

# 큐(Kafka) 경유 비동기 파이프라인(app/inspections/consumer.py) 설정 - ai_server의
# 같은 이름 설정과 짝을 이룬다.
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_INFERENCE_RESULTS_TOPIC = os.getenv("KAFKA_INFERENCE_RESULTS_TOPIC", "inference-results")
# 트레이 여러 개를 이만큼 모아 DB commit 한 번 + 이미지 저장을 배치로 처리한다.
KAFKA_CONSUMER_BATCH_SIZE = int(os.getenv("KAFKA_CONSUMER_BATCH_SIZE", "8"))
KAFKA_CONSUMER_BATCH_TIMEOUT_MS = int(os.getenv("KAFKA_CONSUMER_BATCH_TIMEOUT_MS", "1000"))
