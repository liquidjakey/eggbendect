"""
ai_server -> Kafka(image-requests) 발행.

/predict-async는 이 토픽에 이미지를 던지기만 하고 바로 응답한다 - 실제 추론은
app/consumer.py가 별도 프로세스로 떠서 자기 처리 속도만큼 소비한다. 순간적으로
카메라 요청이 몰려도(30rps 테스트에서 실측한 99%대 타임아웃) 이 토픽이 버퍼
역할을 해서, 느려질지언정 요청 자체가 사라지지는 않는다.

메시지 = 원본 트레이 이미지 바이트(값) + lineId/lotId/captureId/source(헤더).
이미지를 헤더가 아니라 값으로 두는 건 Kafka 메시지 크기 제한(기본 1MB)에
걸리지 않는 한 굳이 base64로 부풀릴 이유가 없어서다.
"""

from kafka import KafkaProducer

from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_IMAGE_REQUESTS_TOPIC

_producer: KafkaProducer | None = None


def get_producer() -> KafkaProducer:
    global _producer
    if _producer is None:
        _producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            # linger.ms: 몇 ms만 모아서 한 번에 네트워크로 내보낸다 - 프로듀서
            # 쪽에서도 요청마다 왕복하지 않고 자연스럽게 작게 배치된다.
            linger_ms=20,
            max_request_size=5 * 1024 * 1024,
        )
    return _producer


def publish_image_request(
    image_bytes: bytes,
    *,
    line_id: str,
    lot_id: str,
    capture_id: str,
    source: str,
) -> None:
    headers = [
        ("lineId", line_id.encode()),
        ("lotId", lot_id.encode()),
        ("captureId", capture_id.encode()),
        ("source", source.encode()),
    ]
    # 키를 lineId로 둬서 같은 라인의 이미지는 항상 같은 파티션 순서를 지킨다
    # (라인 간에는 순서가 섞여도 되지만, 한 라인 안에서는 촬영 순서가 유지돼야 함).
    get_producer().send(
        KAFKA_IMAGE_REQUESTS_TOPIC,
        key=line_id.encode(),
        value=image_bytes,
        headers=headers,
    )
