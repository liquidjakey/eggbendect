"""
S3 흉내를 내는 로컬 디스크 저장소.

save_image()/get_url() 인터페이스만 유지하면, 나중에 실제 S3/MinIO(boto3)로
교체할 때 이 파일만 바꾸면 되고 라우터/서비스 코드는 건드릴 필요가 없다.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import STORAGE_DIR, STORAGE_URL_PREFIX

STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _safe_ext(filename: str | None) -> str:
    """
    업로드 파일명에서 확장자만 뽑는다. 파일명에 경로 구분자가 섞여 있으면
    (예: "a.jpg/../../etc/passwd") "확장자"에 경로 조작 문자열이 그대로
    딸려와 storage/ 밖에 파일을 쓸 수 있으므로, 구분자가 있으면 통째로 버린다.
    """
    if not filename or "." not in filename or "/" in filename or "\\" in filename:
        return ""
    ext = filename.rsplit(".", 1)[-1].lower()
    if not ext.isalnum():
        return ""
    return "." + ext


def save_image(file: UploadFile, key_prefix: str) -> str:
    """업로드된 파일을 storage/ 에 저장하고 정적 서빙 URL을 반환한다."""
    return save_image_bytes(file.file.read(), _safe_ext(file.filename), key_prefix)


def save_image_bytes(data: bytes, ext: str, key_prefix: str) -> str:
    """save_image()와 같은 저장 로직인데, FastAPI의 UploadFile 없이(HTTP 요청 밖에서,
    예: Kafka 컨슈머 프로세스에서) 바로 바이트를 저장할 때 쓴다."""
    key = f"{key_prefix}-{uuid.uuid4().hex[:8]}{ext}"
    dest: Path = STORAGE_DIR / key
    with dest.open("wb") as f:
        f.write(data)
    return get_url(key)


def get_url(key: str) -> str:
    return f"{STORAGE_URL_PREFIX}/{key}"
