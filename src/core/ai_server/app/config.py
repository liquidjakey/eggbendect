import os

# 이 인스턴스가 MONO 모델인지 COLOR 모델인지. 실제로는 MONO/COLOR를 각각
# 다른 프로세스(포트)로 띄운다 - 예: MONO는 8001, COLOR는 8002.
SOURCE = os.getenv("AI_SERVER_SOURCE", "MONO").upper()
if SOURCE not in ("MONO", "COLOR"):
    raise ValueError(f"AI_SERVER_SOURCE는 MONO 또는 COLOR여야 합니다: {SOURCE}")

# 실제 학습된 모델 가중치 경로. 아직 없으면 비워두고 app/model.py의 TODO를 채울 때 같이 채운다.
MODEL_PATH = os.getenv("AI_MODEL_PATH", "")

# 같은 SOURCE(COLOR)라도 후보 모델(yolo11n/yolo11m/rtdetr-l)을 여러 개 동시에
# 띄워 비교할 수 있어, 어느 모델인지 구분할 이름표. 안 주면 가중치 파일명으로 추정.
MODEL_LABEL = os.getenv("AI_MODEL_LABEL") or (
    os.path.splitext(os.path.basename(MODEL_PATH))[0] if MODEL_PATH else SOURCE
)

# 추론 결과를 전달할 backend 주소
BACKEND_URL = os.getenv("AI_BACKEND_URL", "http://127.0.0.1:8000")

# 라인은 이제 MONO/COLOR 전용으로 분리돼 있어(백엔드 Line.source), 기본 라인 이름도
# 이 인스턴스의 소스를 반영해서 짓는다 (예: MONO-01, COLOR-01).
DEFAULT_LINE_ID = os.getenv("AI_DEFAULT_LINE_ID", f"{SOURCE}-01")

# 큐(Kafka) 경유 비동기 파이프라인(/predict-async + app/consumer.py) 설정.
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
# 소스별로 토픽을 분리한다 - 하나의 토픽을 MONO/COLOR 컨슈머가 서로 다른
# group_id로 같이 구독하면, Kafka는 그룹이 다르면 같은 메시지를 각 그룹에
# 전부 복사해서 준다(파티션을 나눠 갖는 게 아니라 그룹마다 전체 사본). 그래서
# 처음엔 하나의 image-requests 토픽을 같이 구독하게 했다가, MONO 컨슈머가
# COLOR 이미지까지 받아 MONO 모델로 잘못 추론하는(그리고 그 반대도) 걸
# 오프셋이 두 그룹에서 완전히 같은 것으로 실측 확인해서 분리했다.
KAFKA_IMAGE_REQUESTS_TOPIC = os.getenv("KAFKA_IMAGE_REQUESTS_TOPIC", f"image-requests-{SOURCE.lower()}")
KAFKA_INFERENCE_RESULTS_TOPIC = os.getenv("KAFKA_INFERENCE_RESULTS_TOPIC", "inference-results")
# 컨슈머가 한 번의 poll에서 최대 이만큼 모아 배치로 처리한다 (트레이 여러 개를
# 모아 크롭 이미지 업로드/DB commit 왕복 횟수를 줄이는 것과 같은 이유).
KAFKA_CONSUMER_BATCH_SIZE = int(os.getenv("KAFKA_CONSUMER_BATCH_SIZE", "8"))
# 배치가 이만큼 안 차도 이 시간(ms)이 지나면 있는 만큼만 처리한다 - 트래픽이
# 뜸할 때 무한정 기다리지 않기 위함.
KAFKA_CONSUMER_BATCH_TIMEOUT_MS = int(os.getenv("KAFKA_CONSUMER_BATCH_TIMEOUT_MS", "1000"))
