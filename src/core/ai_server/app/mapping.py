"""
객체 탐지 모델의 bbox 결과 -> egg 그리드(row/col) 매핑.

행(row)은 항상 3개로 고정(라인의 3개 레인), 열(col)은 캡처마다(컨베이어 진행 방향으로
사진에 찍힌 계란 개수에 따라) 달라진다. 그래서:
  - row: bbox 중심 y좌표를 이미지 높이 기준 3등분해서 결정 (1~3)
  - col: 같은 row 안에서 bbox 중심 x좌표 기준 왼쪽->오른쪽 순서로 1부터 순번을 매긴다
        (고정 격자가 아니라 "그 row 안에서 몇 번째로 찍혔는가"이므로 캡처마다 총 col 수가 달라도 된다)
"""

FIXED_ROWS = 3


def bbox_center(bbox_xyxy: list) -> tuple:
    x1, y1, x2, y2 = bbox_xyxy
    return (x1 + x2) / 2, (y1 + y2) / 2


def _row_from_y(cy: float, image_height: float, rows: int = FIXED_ROWS) -> int:
    row = int(cy // (image_height / rows)) + 1
    return max(1, min(rows, row))


def split_class_name(class_name: str) -> tuple:
    """
    모델의 class_name에 이물질 세부 유형이 함께 붙어 나올 수 있다 (예:
    "FOREIGN_MATERIAL_EGGSHELL"). backend 스키마(DefectType)에 맞는 상위
    분류와, 있다면 세부 유형(subClass)을 따로 뽑아낸다.

    "FOREIGN_MATERIAL_EGGSHELL" -> ("FOREIGN_MATERIAL", "EGGSHELL")
    "NORMAL" / "CRACK" 등        -> (그대로, None)
    """
    prefix = "FOREIGN_MATERIAL_"
    if class_name.startswith(prefix):
        return "FOREIGN_MATERIAL", class_name[len(prefix):]
    return class_name, None


def detections_to_eggs(detection_result: dict) -> list:
    """
    detection_result: model.run_inference()가 반환하는 원본 탐지 스키마
      {"image_width":.., "image_height":.., "detections":[{"class_name","confidence","bbox_xyxy"},...], ...}

    반환: [{"row":int,"col":int,"class":str,"confidence":float,"bboxXyxy":list}, ...]
    (bboxXyxy는 나중에 크롭할 때 쓰려고 같이 들고 다닌다)
    """
    height = detection_result["image_height"]
    detections = detection_result["detections"]

    by_row = {r: [] for r in range(1, FIXED_ROWS + 1)}
    for det in detections:
        cx, cy = bbox_center(det["bbox_xyxy"])
        row = _row_from_y(cy, height)
        class_, sub_class = split_class_name(det["class_name"])
        by_row[row].append(
            {
                "cx": cx,
                "class": class_,
                "subClass": sub_class,
                "confidence": det["confidence"],
                "bboxXyxy": det["bbox_xyxy"],
            }
        )

    eggs = []
    for row, items in by_row.items():
        items.sort(key=lambda d: d["cx"])
        for col, item in enumerate(items, start=1):
            eggs.append(
                {
                    "row": row,
                    "col": col,
                    "class": item["class"],
                    "subClass": item["subClass"],
                    "confidence": item["confidence"],
                    "bboxXyxy": item["bboxXyxy"],
                }
            )
    return eggs
