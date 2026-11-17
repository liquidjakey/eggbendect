"""고정된 판 사진 1장을 현재 best.pt 로 추론해, 정답과 나란히 격자로 보여준다.

매번 같은 사진을 쓰므로 학습이 진행되면서 예측이 어떻게 변하는지 비교할 수 있다.
val 셋 사진을 쓴다 (test 는 최종 시험지라 열지 않는다).
"""
import sys
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).resolve().parent))          # work/color
sys.path.insert(0, str(_P(__file__).resolve().parents[2] / "src" / "core"))  # src/core
import glob
from pathlib import Path
from PIL import Image
from color_infer import predict_tray, to_grid

SAMPLE = "/home/jovyan/data/egg/color/images/val/20221006-00172.jpg"
NAMES  = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]
ABBR   = {"NORMAL": "정상", "CRACK": "균열", "FOREIGN_MATERIAL": "이물",
          "DISCOLORATION": "변색", "DEFORMED": "변형", None: " ·  "}


def truth_grid(img_path):
    lb = img_path.replace("/images/", "/labels/").replace(".jpg", ".txt")
    W, H = Image.open(img_path).size
    dets = []
    for l in open(lb):
        if not l.strip(): continue
        c, cx, cy, w, h = l.split()
        cx, cy, w, h = float(cx) * W, float(cy) * H, float(w) * W, float(h) * H
        # mapping.py 가 bbox 에서 중심을 계산하므로 정답도 실제 bbox 로 만들어 넘긴다
        bbox = [round(cx - w / 2, 1), round(cy - h / 2, 1),
                round(cx + w / 2, 1), round(cy + h / 2, 1)]
        dets.append((cx, cy, NAMES[int(c)], 1.0, bbox))
    return to_grid(dets, H)


def cell_map(g):
    return {(e["row"], e["col"]): e for e in g["eggs"]}


def main(weights):
    mdl = "rtdetr" if "rtdetr" in weights else "yolo"
    from ultralytics import YOLO, RTDETR
    m = (RTDETR if mdl == "rtdetr" else YOLO)(weights)

    pred = predict_tray(m, SAMPLE)
    tru  = truth_grid(SAMPLE)
    P, T = cell_map(pred), cell_map(tru)

    print(f"샘플: {Path(SAMPLE).name}  |  image {pred['image']['width']}x{pred['image']['height']}")
    print(f"판 격자 : 예측 {pred['tray']['rows']}행 {pred['tray']['cols']}열"
          f"  /  정답 {tru['tray']['rows']}행 {tru['tray']['cols']}열")
    print(f"검출 수 : 예측 {len(pred['eggs'])}개  /  정답 {len(tru['eggs'])}개\n")

    R = max([r for r, _ in T] + [r for r, _ in P], default=0)
    C = max([c for _, c in T] + [c for _, c in P], default=0)
    hit = miss = wrong = extra = 0

    print("     " + "".join(f"{'열'+str(c):^16}" for c in range(1, C + 1)))
    for r in range(1, R + 1):
        line_t, line_p = f"{r}행 정답 ", "   예측 "
        for c in range(1, C + 1):
            t, p = T.get((r, c)), P.get((r, c))
            tc = t["class"] if t else None
            pc = p["class"] if p else None
            line_t += f"{ABBR[tc]:^16}"
            if p is None:
                cell = ABBR[None]
            else:
                mark = "O" if pc == tc else "X"
                cell = f"{ABBR[pc]}{mark}{p['confidence']:.2f}"
            line_p += f"{cell:^16}"
            if t and p and pc == tc: hit += 1
            elif t and p: wrong += 1
            elif t and not p: miss += 1
            elif p and not t: extra += 1
        print(line_t); print(line_p); print()

    tot = hit + wrong + miss
    print(f"맞음 {hit} / 클래스틀림 {wrong} / 놓침 {miss} / 헛검출 {extra}"
          f"   -> 정확도 {hit*100/max(tot,1):.0f}%")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "runs/detect/yolo11m/weights/best.pt")
