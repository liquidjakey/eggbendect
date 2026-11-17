"""이미지 크롭 유틸. bbox_xyxy(픽셀 절대좌표)로 원본 트레이 사진에서 계란 하나씩 잘라낸다."""

import io

from PIL import Image


def crop_bbox(image_bytes: bytes, bbox_xyxy: list, padding: int = 0) -> bytes:
    img = Image.open(io.BytesIO(image_bytes))
    x1, y1, x2, y2 = bbox_xyxy
    x1 = max(0, int(x1) - padding)
    y1 = max(0, int(y1) - padding)
    x2 = min(img.width, int(x2) + padding)
    y2 = min(img.height, int(y2) + padding)
    cropped = img.crop((x1, y1, x2, y2))

    buf = io.BytesIO()
    cropped.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()
