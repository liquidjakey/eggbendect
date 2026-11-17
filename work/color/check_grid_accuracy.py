"""격자 변환 정확도를 잰다.

bbox -> (row, col) 변환이 얼마나 정확한지 확인한다.
'rows != 3 비율' 은 지표로 쓸 수 없다 - 판당 계란 수가 0~15 개로 제각각이라
정답 라벨로 돌려도 rows=3 이 84% 밖에 안 나온다. 판이 비어서 그런 것이지
모델이 틀린 게 아니다.

그래서 **정답 라벨로 만든 격자와 모델 예측으로 만든 격자를 비교**한다.
같은 함수(실서비스 mapping.py)로 양쪽을 만들므로 변환 규칙의 특성은 상쇄되고,
모델이 계란을 제자리에 배치했는지만 남는다.

측정 항목
  격자 완전 일치율   판 전체의 (row,col) 배치가 정답과 똑같은 판의 비율
  계란 단위 정확도   계란 하나하나가 정답과 같은 칸에 들어간 비율
  행 정확도          행만 맞았는지 (열은 무시)

사용법: python3 work/color/check_grid_accuracy.py [이미지수] [split]
"""
import collections
import glob
import sys

sys.path.insert(0, "/home/jovyan/src/core/ai_server")
sys.path.insert(0, "/home/jovyan/src/core")
from PIL import Image

from app.mapping import detections_to_eggs
from app import model as aimodel

NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SPLIT = sys.argv[2] if len(sys.argv) > 2 else "test"


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def truth_boxes(img_path):
    W, H = Image.open(img_path).size
    lb = img_path.replace("/images/", "/labels/").replace(".jpg", ".txt")
    out = []
    for l in open(lb):
        if not l.strip():
            continue
        c, cx, cy, w, h = l.split()
        cx, cy, w, h = float(cx)*W, float(cy)*H, float(w)*W, float(h)*H
        out.append((NAMES[int(c)], [cx-w/2, cy-h/2, cx+w/2, cy+h/2]))
    return out, H


def to_grid(items, height):
    """items: [(class_name, bbox)] -> {bbox_key: (row, col)}  실서비스 함수 사용"""
    eggs = detections_to_eggs({
        "image_height": height,
        "detections": [{"class_name": c, "confidence": 1.0, "bbox_xyxy": b}
                       for c, b in items],
    })
    return {tuple(round(v, 1) for v in e["bboxXyxy"]): (e["row"], e["col"]) for e in eggs}


aimodel.load_model()
imgs = sorted(glob.glob(f"/home/jovyan/data/egg/color/images/{SPLIT}/*.jpg"))
imgs = [imgs[int(i * len(imgs) / N)] for i in range(N)]

tray_exact = tray_tot = 0
egg_ok = egg_row_ok = egg_tot = 0
missed = extra = 0
rows_pred = collections.Counter()

for i, p in enumerate(imgs):
    gts, H = truth_boxes(p)
    if not gts:
        continue
    r = aimodel._model.predict(source=Image.open(p), conf=0.25, device="cpu",
                               agnostic_nms=True, verbose=False)[0]
    preds = [(r.names[int(b.cls.item())], b.xyxy[0].tolist()) for b in r.boxes]
    if not preds:
        missed += len(gts)
        continue

    g_grid = to_grid(gts, H)
    p_grid = to_grid(preds, H)
    rows_pred[max((rc[0] for rc in p_grid.values()), default=0)] += 1

    # 정답 계란마다 가장 많이 겹치는 예측을 찾아 격자 좌표를 비교
    # ★ detections_to_eggs 는 행·열 순으로 정렬해 반환한다. 원본 순서와 zip 하면
    #   엉뚱한 짝이 된다. bbox 를 키로 조회해야 한다.
    key = lambda b: tuple(round(v, 1) for v in b)
    g_items = [((c, b), g_grid[key(b)]) for c, b in gts if key(b) in g_grid]
    p_items = [((c, b), p_grid[key(b)]) for c, b in preds if key(b) in p_grid]
    used = [False] * len(p_items)
    tray_ok = True
    tray_tot += 1
    for (gc, gb), grc in g_items:
        egg_tot += 1
        best, bi = 0.5, -1
        for j, ((pc, pb), prc) in enumerate(p_items):
            if used[j]:
                continue
            v = iou(gb, pb)
            if v >= best:
                best, bi = v, j
        if bi < 0:
            missed += 1
            tray_ok = False
            continue
        used[bi] = True
        prc = p_items[bi][1]
        if prc == grc:
            egg_ok += 1
        else:
            tray_ok = False
        if prc[0] == grc[0]:
            egg_row_ok += 1
    extra += sum(1 for u in used if not u)
    if tray_ok:
        tray_exact += 1
    if (i + 1) % 100 == 0:
        print(f"  {i+1}/{len(imgs)}", flush=True)

print(f"\n{SPLIT} {tray_tot}판 · 계란 {egg_tot:,}개 · 격자 변환 정확도\n")
print(f"  계란 단위 (행·열 모두 일치)   {egg_ok:,}/{egg_tot:,}   {egg_ok/max(egg_tot,1)*100:6.2f}%")
print(f"  행만 일치                     {egg_row_ok:,}/{egg_tot:,}   {egg_row_ok/max(egg_tot,1)*100:6.2f}%")
print(f"  판 전체 완전 일치             {tray_exact:,}/{tray_tot:,}   {tray_exact/max(tray_tot,1)*100:6.2f}%")
print(f"\n  검출 못한 계란 {missed}개 · 정답에 없는 검출 {extra}개")
print(f"  예측 격자의 행 수 분포: {dict(sorted(rows_pred.items()))}")
