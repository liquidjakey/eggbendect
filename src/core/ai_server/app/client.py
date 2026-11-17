"""
ai_server -> backend 결과 전달.

지금은 추론 결과 나오자마자 backend에 동기 HTTP로 직접 쏜다. 나중에 카프카를
붙일 때는 이 파일만 바꾸면 된다 (storage.py가 로컬 디스크 -> S3 스왑 포인트를
문서화해둔 것과 같은 패턴):
  - forward_to_backend()/upload_egg_image() 내부를 producer.send(topic, payload)로
    교체하고, backend 쪽엔 별도 컨슈머 프로세스를 하나 만들어서 app.inspections.service의
    ingest_capture()/이미지 저장 로직을 그대로 재사용하면 된다 (라우터는 이미 얇은
    래퍼라 서비스 함수 자체는 손댈 필요 없음).

카프카가 들어오기 전까지는, backend가 순간적으로 안 받아질 때 결과가 그냥
유실되지 않도록 재시도만 넣어둔다.
"""

import time

import httpx

from app.config import BACKEND_URL

_RETRY_ATTEMPTS = 3
_RETRY_BACKOFF_SECONDS = 0.5


def _post_with_retry(url: str, **kwargs) -> httpx.Response | None:
    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            return httpx.post(url, timeout=10.0, **kwargs)
        except httpx.HTTPError:
            if attempt == _RETRY_ATTEMPTS:
                return None
            time.sleep(_RETRY_BACKOFF_SECONDS * attempt)
    return None


def forward_to_backend(payload: dict) -> tuple:
    """추론 결과를 backend의 POST /inspections로 전달한다. 성공 시 생성/갱신된 inspection 목록도 반환."""
    resp = _post_with_retry(f"{BACKEND_URL}/inspections", json=payload)
    if resp is None:
        return False, None, None
    ok = resp.status_code < 400
    body = resp.json() if ok else None
    return ok, resp.status_code, body


def upload_egg_image(inspection_id: int, image_bytes: bytes, filename: str = "crop.jpg") -> bool:
    """크롭한 계란 이미지를 backend의 POST /inspections/{id}/images로 업로드한다.
    라인이 MONO/COLOR 전용으로 분리돼 있어 한 계란에 이미지는 하나뿐이라 필드도 하나."""
    files = {"image": (filename, image_bytes, "image/jpeg")}
    resp = _post_with_retry(f"{BACKEND_URL}/inspections/{inspection_id}/images", files=files)
    return resp is not None and resp.status_code < 400


def upload_egg_images_batch(items: list[tuple[int, bytes]]) -> int:
    """트레이 하나 분량의 크롭 이미지를 POST /inspections/images/batch로 한 번에
    업로드한다 - 계란마다 upload_egg_image()를 따로 부르면 트레이당(최대 16개) 왕복이
    그만큼 생기는데, 이걸로 한 번의 요청으로 묶는다. 저장된 개수를 반환한다."""
    if not items:
        return 0
    files = [("images", (f"{insp_id}.jpg", data, "image/jpeg")) for insp_id, data in items]
    # httpx는 반복되는 폼 필드를 list-of-tuples가 아니라 dict의 리스트 값으로
    # 넘겨야 한다 - list-of-tuples로 주면 멀티파트 스트림 인코더가 깨진다(실측).
    form = {"inspectionIds": [str(insp_id) for insp_id, _ in items]}
    resp = _post_with_retry(f"{BACKEND_URL}/inspections/images/batch", files=files, data=form)
    if resp is None or resp.status_code >= 400:
        return 0
    return len(resp.json())
