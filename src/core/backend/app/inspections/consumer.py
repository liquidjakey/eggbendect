"""
inference-results 토픽 컨슈머 - 별도 프로세스로 띄운다 (FastAPI 앱과는 다른 프로세스).

ai_server의 컨슈머(app/consumer.py)가 추론 끝낸 결과를 여기로 보내면, 이 프로세스가
트레이 여러 개를 모아 DB에 배치로 저장한다:
  1) 계란 upsert - 트레이 개별이 아니라 배치 전체에 commit 한 번(ingest_captures_batch)
  2) 크롭 이미지 저장 - 배치 전체 저장이 끝난 뒤 image_url을 한 번에 갱신, commit 한 번

동기 파이프라인 실측(30rps)에서 backend 저장 단계 자체가 90%대로 유실되던 걸,
이 토픽이 버퍼가 되어 흡수한다 - backend가 순간적으로 못 따라가도 메시지는 토픽에
남아있고, 이 컨슈머가 자기 페이스대로 따라잡으면서 결국 다 처리한다.

실행: python3 -m app.inspections.consumer
"""

import base64
import json
import time

from kafka import KafkaConsumer

from app.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CONSUMER_BATCH_SIZE,
    KAFKA_CONSUMER_BATCH_TIMEOUT_MS,
    KAFKA_INFERENCE_RESULTS_TOPIC,
)
from app.database import SessionLocal
from app.inspections import service
from app.inspections.model import Inspection
from app.inspections.schema import EggGridResult, InspectionIngestRequest
from app.storage import save_image_bytes


def _message_to_payload(msg_value: dict) -> tuple[InspectionIngestRequest, list[dict]]:
    payload = InspectionIngestRequest(
        lineId=msg_value["lineId"],
        lotId=msg_value["lotId"],
        captureId=msg_value["captureId"],
        source=msg_value["source"],
        eggs=[EggGridResult(**e) for e in msg_value["eggs"]],
    )
    return payload, msg_value.get("crops", [])


def _save_batch_images(per_tray_records: list[list[Inspection]], per_tray_crops: list[list[dict]]) -> int:
    """각 트레이의 (row,col) 크롭을 그 트레이의 Inspection 레코드와 매칭해 저장하고
    image_url을 채운다. 커밋은 호출하는 쪽에서 배치 전체 한 번에 한다."""
    saved = 0
    for records, crops in zip(per_tray_records, per_tray_crops):
        by_row_col = {(r.row, r.col): r for r in records}
        for crop in crops:
            record = by_row_col.get((crop["row"], crop["col"]))
            if record is None:
                continue
            image_bytes = base64.b64decode(crop["imageBase64"])
            record.image_url = save_image_bytes(image_bytes, ".jpg", key_prefix=record.egg_id)
            saved += 1
    return saved


def run():
    consumer = KafkaConsumer(
        KAFKA_INFERENCE_RESULTS_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="backend-consumer",
        auto_offset_reset="earliest",
        enable_auto_commit=False,  # DB commit까지 끝난 뒤에만 오프셋 커밋 (처리 중 죽으면 재처리 - 유실 방지)
        max_poll_records=KAFKA_CONSUMER_BATCH_SIZE,
        value_deserializer=lambda v: json.loads(v.decode()),
    )

    print(f"[backend-consumer] 시작 - topic={KAFKA_INFERENCE_RESULTS_TOPIC} batch_size={KAFKA_CONSUMER_BATCH_SIZE}")

    while True:
        records = consumer.poll(timeout_ms=KAFKA_CONSUMER_BATCH_TIMEOUT_MS, max_records=KAFKA_CONSUMER_BATCH_SIZE)
        if not records:
            continue

        batch_t0 = time.perf_counter()
        payloads: list[InspectionIngestRequest] = []
        crops_by_tray: list[list[dict]] = []
        for _tp, messages in records.items():
            for msg in messages:
                try:
                    payload, crops = _message_to_payload(msg.value)
                except Exception as e:  # noqa: BLE001 - 메시지 하나가 깨져도 배치 전체를 죽이지 않음
                    print(f"[backend-consumer] 메시지 파싱 실패: {e}")
                    continue
                payloads.append(payload)
                crops_by_tray.append(crops)

        if not payloads:
            consumer.commit()
            continue

        db = SessionLocal()
        try:
            per_tray_records = service.ingest_captures_batch(db, payloads)
            image_count = _save_batch_images(per_tray_records, crops_by_tray)
            db.commit()  # 이미지 URL 갱신 커밋 - 배치 전체에 한 번
        except Exception as e:  # noqa: BLE001
            db.rollback()
            print(f"[backend-consumer] 배치 저장 실패, 오프셋 커밋 안 함(재시도됨): {e}")
            db.close()
            continue
        finally:
            db.close()

        consumer.commit()  # DB 저장까지 끝난 뒤에만 오프셋 커밋
        elapsed = (time.perf_counter() - batch_t0) * 1000
        egg_count = sum(len(p.eggs) for p in payloads)
        print(f"[backend-consumer] 배치 트레이 {len(payloads)}개 · 계란 {egg_count}개 · 이미지 {image_count}개 저장 완료 ({elapsed:.0f}ms)")


if __name__ == "__main__":
    run()
