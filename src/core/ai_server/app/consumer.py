"""
image-requests 토픽 컨슈머 - 별도 프로세스로 띄운다 (FastAPI 앱과는 다른 프로세스).

/predict-async가 큐에 올려둔 트레이 이미지를 이 프로세스가 자기 처리 속도만큼
꺼내서(poll) 추론하고, 결과를 inference-results 토픽에 발행한다. 메시지 하나마다
poll -> 추론 -> 발행 -> 커밋을 한다 - 추론이 트레이당 수십~수백ms로 병목이라
Kafka poll/flush 왕복(로컬 브로커라 1~5ms) 몇 번 줄이는 걸로는 체감 이득이 없어서,
여러 장을 모아 poll하는 배치는 걷어냈다(예전엔 그렇게 했었음).
처리량을 올리려면 여기서 배치를 늘리는 게 아니라 ① 진짜 배치 추론(모델에 여러
장을 한 번에 넣기)이나 ② 컨슈머 프로세스를 여러 개 띄워 파티션을 나눠 갖는
병렬 처리 쪽으로 가야 한다.

실행: python3 -m app.consumer  (워커를 여러 개 띄우면 컨슈머 그룹이 파티션을
나눠 가져가 자연스럽게 병렬 처리된다 - 지금 6개 파티션이 있음)
"""

import base64
import json
import time

from kafka import KafkaConsumer, KafkaProducer

from app import imaging, mapping, model
from app.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_IMAGE_REQUESTS_TOPIC,
    KAFKA_INFERENCE_RESULTS_TOPIC,
    SOURCE,
)


def _header(headers, key: str) -> str:
    for k, v in headers:
        if k == key:
            return v.decode()
    return ""


def _process_one(image_bytes: bytes, line_id: str, lot_id: str, capture_id: str, source: str) -> dict:
    """이미지 1장 -> 추론 -> 계란별 크롭까지 끝낸 결과 메시지(dict)로 반환.
    DB 저장은 여기서 안 한다 - backend 컨슈머가 여러 트레이를 모아 한 번에 한다."""
    detection_result = model.run_inference(image_bytes)
    eggs_raw = mapping.detections_to_eggs(detection_result)

    eggs = []
    crops_b64 = []
    for e in eggs_raw:
        eggs.append({
            "row": e["row"], "col": e["col"], "class": e["class"],
            "subClass": e["subClass"], "confidence": e["confidence"],
        })
        crop_bytes = imaging.crop_bbox(image_bytes, e["bboxXyxy"])
        crops_b64.append({"row": e["row"], "col": e["col"], "imageBase64": base64.b64encode(crop_bytes).decode()})

    return {
        "lineId": line_id, "lotId": lot_id, "captureId": capture_id,
        "source": source, "eggs": eggs, "crops": crops_b64,
    }


def run():
    model.load_model()

    consumer = KafkaConsumer(
        KAFKA_IMAGE_REQUESTS_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=f"ai-consumer-{SOURCE}",
        auto_offset_reset="earliest",
        enable_auto_commit=False,  # 이 메시지의 발행까지 끝난 뒤에만 수동 커밋 (처리 중 죽으면 재처리됨 - 유실 방지)
    )
    producer = KafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)

    print(f"[ai-consumer:{SOURCE}] 시작 - topic={KAFKA_IMAGE_REQUESTS_TOPIC}")

    for msg in consumer:
        line_id = _header(msg.headers, "lineId")
        lot_id = _header(msg.headers, "lotId")
        capture_id = _header(msg.headers, "captureId")
        source = _header(msg.headers, "source") or SOURCE

        t0 = time.perf_counter()
        try:
            result = _process_one(msg.value, line_id, lot_id, capture_id, source)
            producer.send(
                KAFKA_INFERENCE_RESULTS_TOPIC,
                key=line_id.encode(),
                value=json.dumps(result).encode(),
            )
            producer.flush()
        except Exception as e:  # noqa: BLE001 - 메시지 하나 실패로 전체 컨슈머 루프가 죽으면 안 됨
            print(f"[ai-consumer:{SOURCE}] 처리 실패 captureId={capture_id}: {e}")
            continue

        consumer.commit()  # 발행까지 끝난 뒤에만 오프셋 커밋
        elapsed = (time.perf_counter() - t0) * 1000
        print(f"[ai-consumer:{SOURCE}] captureId={capture_id} 처리 완료 ({elapsed:.0f}ms)")


if __name__ == "__main__":
    run()
