"""MONO 계란 품질 판정 — 추론 스크립트.

사용법:
    from inference import load_model, predict_to_json
    model = load_model("mono_yolo11n.pt")
    result = predict_to_json(model, "some_tray_photo.jpg", tray_rows=3, tray_cols=5)
"""

import json
from pathlib import Path

from ultralytics import YOLO

MONO_NAMES = {
    0: "NORMAL",
    1: "CRACK",
    2: "BLOOD_SPOT",
    3: "DISCOLORATION",
    4: "FOREIGN_MATERIAL_EGGSHELL",
    5: "FOREIGN_MATERIAL_FEATHER",
    6: "FOREIGN_MATERIAL_CHICKEN_DROPPINGS",
    7: "FOREIGN_MATERIAL_SPECKLED",
    8: "DEFORMED",
}


def load_model(weights_path="mono_yolo11n.pt"):
    return YOLO(weights_path)


def predict_to_json(model, image_path, names=MONO_NAMES, conf=0.25, tray_rows=None, tray_cols=None):
    """이미지 한 장을 추론해 JSON 직렬화 가능한 dict로 반환.

    tray_rows/tray_cols를 넘기면 각 detection에 트레이 격자 위치(row, col)를 매기고,
    같은 슬롯에 detection이 여러 개 겹치면 confidence가 가장 높은 것만 남긴다
    (달걀 한 개 = detection 한 개 보장). 안 넘기면 row/col/tray 없이 예전 포맷 그대로.
    """
    result = model.predict(source=str(image_path), conf=conf, device=0, verbose=False)[0]
    img_w, img_h = result.orig_shape[1], result.orig_shape[0]

    detections = []
    for box in result.boxes:
        cls_id = int(box.cls.item())
        cls_name = names[cls_id]
        x_min, y_min, x_max, y_max = [round(v, 1) for v in box.xyxy[0].tolist()]

        det = {
            "class_id": cls_id,
            "class_name": cls_name,
            "confidence": round(float(box.conf.item()), 4),
            "bbox_xyxy": [x_min, y_min, x_max, y_max],
        }
        if tray_rows and tray_cols:
            cx, cy = (x_min + x_max) / 2, (y_min + y_max) / 2
            det["row"] = min(tray_rows, int(cy / img_h * tray_rows) + 1)
            det["col"] = min(tray_cols, int(cx / img_w * tray_cols) + 1)

        detections.append(det)

    if tray_rows and tray_cols:
        best_per_slot = {}
        for det in detections:
            key = (det["row"], det["col"])
            if key not in best_per_slot or det["confidence"] > best_per_slot[key]["confidence"]:
                best_per_slot[key] = det
        detections = sorted(best_per_slot.values(), key=lambda d: (d["row"], d["col"]))

    class_counts = {}
    for det in detections:
        class_counts[det["class_name"]] = class_counts.get(det["class_name"], 0) + 1

    output = {
        "image_id": Path(image_path).name,
        "image_width": img_w,
        "image_height": img_h,
        "detections": detections,
        "summary": class_counts,
    }
    if tray_rows and tray_cols:
        output["tray"] = {"rows": tray_rows, "cols": tray_cols}
    return output


def predict_batch_to_json(model, image_dir, names=MONO_NAMES, conf=0.25, tray_rows=None, tray_cols=None):
    results = []
    for image_path in sorted(Path(image_dir).glob("*.jpg")):
        results.append(
            predict_to_json(model, image_path, names=names, conf=conf, tray_rows=tray_rows, tray_cols=tray_cols)
        )
    return {"results": results}


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("usage: python inference.py <image_path> [tray_rows] [tray_cols]")
        sys.exit(1)

    model = load_model()
    rows = int(sys.argv[2]) if len(sys.argv) > 2 else None
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else None
    out = predict_to_json(model, sys.argv[1], tray_rows=rows, tray_cols=cols)
    print(json.dumps(out, indent=2, ensure_ascii=False))
