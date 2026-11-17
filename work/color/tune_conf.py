"""추론 후처리 튜닝 — 학습 없이 macro Recall 을 끌어올린다.

## 이 스크립트가 다루는 문제

우리 문제의 '놓침' 은 계란을 못 찾는 게 아니라 유형을 잘못 맞히는 것이다.
실측(val 340 개 계란, yolo11m 13 epoch 시점):

    1순위가 틀린 계란            28 개 (8.2%)
    그중 정답이 후보로 살아있음   25 개 (89.3%)   2순위 20 · 3순위 5
    정답 점수 중앙값 0.210 (최대 0.490) vs 오답 1순위 0.651
    아슬아슬한 예: 0.490 vs 0.562 · 0.485 vs 0.507 · 0.405 vs 0.408

즉 정답은 대부분 '있는데 2등' 이다. 그래서 두 가지 손잡이를 각각 재본다.

## 손잡이 1 — conf 문턱 (mode=conf)

문턱을 낮춰 애매한 검출을 살린다. 다만 위 진단대로 놓침이 '검출 실패' 가 아니라
'오분류' 라면 새로 살아날 검출이 없어 효과가 없을 것으로 본다. 확인용으로 남긴다.

## 손잡이 2 — 클래스 가중치 (mode=weights)  ★ 핵심

박스마다 모든 클래스 후보를 살린 뒤(multi_label), 점수에 클래스별 가중치를 곱하고
다시 최고점 하나만 고른다. 희소 클래스에 가중치를 주면 위의 아슬아슬한 경우가 뒤집힌다.

    ※ 클래스별 '문턱' 을 낮추는 방식은 쓰지 않는다. 그러면 한 계란이 두 클래스로
      동시에 검출돼 FP 가 늘고, 한 칸에 계란 2 개가 들어가 격자 매핑이 깨진다.
      가중치를 곱한 뒤 argmax 를 다시 하면 계란당 검출은 정확히 1 개로 유지된다.

## 왜 multi_label 을 강제로 켜나

ultralytics 의 predict 는 non_max_suppression 에 multi_label 을 넘기지 않아
기본값 False 로 동작한다. 박스마다 최고점 클래스 하나만 남고 나머지는 argmax
단계에서 사라진다 (NMS 가 지우는 게 아니라 애초에 만들어지지 않는다 - agnostic_nms
를 꺼도 계란당 후보가 1.00 → 1.01 로 거의 늘지 않는 것으로 확인했다).
2 순위 후보를 보려면 multi_label=True 가 필요하다.

★ val 셋에서만 돌린다. test 로 값을 고르면 그건 성적표가 아니다.

사용법
    python3 work/color/tune_conf.py yolo11m --mode conf
    python3 work/color/tune_conf.py yolo11m --mode weights
"""
import argparse, csv, functools, json, sys
from pathlib import Path

sys.path.insert(0, "/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)

from PIL import Image
from ultralytics.utils import nms as _nmsmod

_orig_nms = _nmsmod.non_max_suppression


@functools.wraps(_orig_nms)
def _multi_label_nms(*a, **k):
    k["multi_label"] = True
    return _orig_nms(*a, **k)


NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]
ROOT  = Path("/home/jovyan/data/egg/color")
RUNS  = Path("/home/jovyan/runs/detect")
OUT   = Path("/home/jovyan/results")
IOU_MATCH = 0.5      # 정답과 검출을 같은 것으로 볼 겹침 기준
IOU_GROUP = 0.5      # 같은 계란의 후보로 묶을 겹침 기준
MIN_SUPPORT_MACRO = 30   # 표본이 이보다 적은 클래스는 macro 에서 제외 (evaluate.py 와 동일)


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0: return 0.0
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def load_truth(img_path):
    W, H = Image.open(img_path).size
    lb = str(img_path).replace("/images/", "/labels/").replace(".jpg", ".txt")
    out = []
    for l in open(lb):
        if not l.strip(): continue
        c, cx, cy, w, h = l.split()
        cx, cy, w, h = float(cx)*W, float(cy)*H, float(w)*W, float(h)*H
        out.append((int(c), [cx-w/2, cy-h/2, cx+w/2, cy+h/2]))
    return out


def collect(model, imgs, conf_floor=0.01, device=None, batch=16):
    """계란 자리마다 '후보 클래스 목록' 을 모은다. 추론은 딱 한 번만 한다."""
    _nmsmod.non_max_suppression = _multi_label_nms       # 2순위 후보를 살린다
    try:
        per_img = []
        done = 0
        # ★ 이미지 목록을 통째로 넘기면 batch 인자가 무시되고 전부 한 배치로 묶여
        #   OOM 이 난다 (2,000장에서 48GB 할당 시도). 직접 청크로 쪼개 넘긴다.
        chunks = [imgs[i:i+batch] for i in range(0, len(imgs), batch)]
        for chunk in chunks:
          for r in model.predict(source=[str(p) for p in chunk], conf=conf_floor,
                                 agnostic_nms=False, max_det=300, device=device,
                                 stream=True, verbose=False):
              dets = [(int(r.boxes.cls[i]), float(r.boxes.conf[i]),
                       r.boxes.xyxy[i].tolist()) for i in range(len(r.boxes))]
              dets.sort(key=lambda d: -d[1])
              # 같은 계란(겹치는 박스)의 후보들을 한 묶음으로
              groups, used = [], [False]*len(dets)
              for i, d in enumerate(dets):
                  if used[i]: continue
                  used[i] = True
                  g = {"box": d[2], "cands": [(d[0], d[1])]}
                  for j in range(i+1, len(dets)):
                      if not used[j] and iou(d[2], dets[j][2]) > IOU_GROUP:
                          used[j] = True
                          g["cands"].append((dets[j][0], dets[j][1]))
                  groups.append(g)
              per_img.append(groups)
              done += 1
              if done % 500 == 0: print(f"    추론 {done}/{len(imgs)}", flush=True)
        return per_img
    finally:
        _nmsmod.non_max_suppression = _orig_nms


def resolve(groups, weights):
    """계란 자리마다 가중치를 곱해 최고점 하나만 남긴다 -> 계란당 검출 정확히 1개."""
    out = []
    for g in groups:
        cls, sc = max(g["cands"], key=lambda c: c[1] * weights[c[0]])
        out.append((cls, sc, g["box"]))
    return out


def score(per_img, truths, weights, conf):
    tp = [0]*5; fp = [0]*5; fn = [0]*5
    for groups, gts in zip(per_img, truths):
        dets = [d for d in resolve(groups, weights) if d[1] >= conf]
        dets.sort(key=lambda d: -d[1])
        used = [False]*len(gts)
        for cls, sc, box in dets:
            best, bi = IOU_MATCH, -1
            for j, (gc, gb) in enumerate(gts):
                if used[j] or gc != cls: continue
                v = iou(box, gb)
                if v >= best: best, bi = v, j
            if bi >= 0: used[bi] = True; tp[cls] += 1
            else:       fp[cls] += 1
        for j, (gc, _) in enumerate(gts):
            if not used[j]: fn[gc] += 1

    per = {}
    for c, n in enumerate(NAMES):
        sup = tp[c] + fn[c]
        R = tp[c]/sup if sup else None
        P = tp[c]/(tp[c]+fp[c]) if tp[c]+fp[c] else (None if sup == 0 else 0.0)
        F = 2*P*R/(P+R) if (P and R) else (None if sup == 0 else 0.0)
        per[n] = {"P": P, "R": R, "F1": F, "TP": tp[c], "FP": fp[c],
                  "FN": fn[c], "support": sup}
    have = [n for n in NAMES if per[n]["support"] >= MIN_SUPPORT_MACRO]
    macro = {k: (sum(per[n][k] for n in have)/len(have) if have else 0.0)
             for k in ("P", "R", "F1")}
    macro["used"] = have
    return per, macro


def show_row(label, per, macro):
    cell = lambda v: f"{v:>10.3f}" if v is not None else f"{'-':>10}"
    print(f"  {label:>14}" + "".join(cell(per[n]["R"]) for n in NAMES)
          + f"{macro['R']:>9.3f}{macro['P']:>9.3f}{macro['F1']:>9.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--mode", default="weights", choices=["conf", "weights", "fixed"],
                    help="fixed = 주어진 가중치로 채점만 한다 (탐색하지 않음)")
    ap.add_argument("--split", default="val", choices=["val", "test"],
                    help="test 는 최종 시험지다. --yes 가 있어야 열린다")
    ap.add_argument("--fixed-weights", default="1.0,1.0,1.0,1.0,1.0",
                    help="mode=fixed 에서 쓸 클래스 가중치")
    ap.add_argument("--yes", action="store_true", help="test 셋을 열겠다는 확인")
    ap.add_argument("--thresholds", default="0.05,0.10,0.15,0.20,0.25,0.30,0.40,0.50")
    ap.add_argument("--conf", type=float, default=0.25, help="weights 모드에서 고정할 문턱")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--device", default=None,
                    help="학습이 GPU 를 쓰는 중이면 cpu 로 돌린다 (OOM 회피)")
    ap.add_argument("--batch", type=int, default=16)
    a = ap.parse_args()

    w = RUNS / a.model / "weights" / "best.pt"
    if not w.exists(): sys.exit(f"가중치가 없다: {w}")

    if a.split == "test" and not a.yes:
        sys.exit("test 는 최종 시험지다. 정말 열려면 --yes 를 붙여라.\n"
                 "  탐색(mode=weights)은 val 에서만 한다. test 는 확정된 값으로 채점만 한다.")
    if a.split == "test" and a.mode == "weights":
        sys.exit("test 에서 가중치를 탐색하면 그건 성적표가 아니다.\n"
                 "  val 에서 --mode weights 로 값을 정하고, test 는 --mode fixed 로 채점해라.")

    imgs = sorted((ROOT/"images"/a.split).glob("*.jpg"))
    if a.limit and a.limit < len(imgs):
        step = len(imgs) / a.limit        # 앞부분만 뽑으면 202209 배치에 쏠린다
        imgs = [imgs[int(i*step)] for i in range(a.limit)]

    from ultralytics import YOLO, RTDETR
    Loader = RTDETR if a.model.startswith("rtdetr") else YOLO
    print(f"  {a.model} · {a.split} {len(imgs):,}장 · multi_label 추론 1회\n")
    per_img = collect(Loader(str(w)), imgs, device=a.device, batch=a.batch)
    truths  = [load_truth(p) for p in imgs]

    ncand = [len(g["cands"]) for gs in per_img for g in gs]
    ngrp  = sum(len(gs) for gs in per_img)
    print(f"    계란 자리 {ngrp:,}곳 · 자리당 후보 평균 {sum(ncand)/max(len(ncand),1):.2f}개")
    cnt = [0]*5
    for gts in truths:
        for gc, _ in gts: cnt[gc] += 1
    print("    정답 분포: " + "  ".join(f"{n}={cnt[i]:,}" for i, n in enumerate(NAMES)))
    small = [NAMES[i] for i, c in enumerate(cnt) if 0 < c < MIN_SUPPORT_MACRO]
    if small:
        print(f"    ⚠ 표본 {MIN_SUPPORT_MACRO} 미만이라 macro 에서 제외: {', '.join(small)}")
    print()

    hdr = (f"  {'':>14}" + "".join(f"{n[:9]:>10}" for n in NAMES)
           + f"{'macroR':>9}{'macroP':>9}{'macroF1':>9}")
    ones = [1.0]*5
    rows = []

    if a.mode == "fixed":
        fw = [float(x) for x in a.fixed_weights.split(",")]
        print(hdr); print("  " + "-"*92)
        per0, mac0 = score(per_img, truths, ones, a.conf)
        show_row("가중치 없음", per0, mac0)
        per1, mac1 = score(per_img, truths, fw, a.conf)
        show_row("가중치 적용", per1, mac1)
        print("  " + "-"*92)
        print(f"\n  적용 가중치: " + "  ".join(f"{n}={fw[i]:.1f}" for i, n in enumerate(NAMES)))
        for k, lab in (("R","macro Recall"), ("P","macro Precision"), ("F1","macro F1")):
            print(f"  {lab:<16} {mac0[k]:.4f} → {mac1[k]:.4f}  ({(mac1[k]-mac0[k])*100:+.2f}%p)")
        for tag, per, mac in (("off", per0, mac0), ("on", per1, mac1)):
            rows.append({"mode": f"fixed-{tag}", "conf": a.conf,
                         "weights": "1,1,1,1,1" if tag=="off" else a.fixed_weights,
                         **{f"R_{n}": (round(per[n]['R'],4) if per[n]['R'] is not None else "")
                            for n in NAMES},
                         "macro_R": round(mac['R'],4), "macro_P": round(mac['P'],4),
                         "macro_F1": round(mac['F1'],4)})

    elif a.mode == "conf":
        print(hdr); print("  " + "-"*92)
        for t in [float(x) for x in a.thresholds.split(",")]:
            per, macro = score(per_img, truths, ones, t)
            show_row(f"conf={t:.2f}", per, macro)
            rows.append({"mode": "conf", "conf": t, "weights": "1,1,1,1,1",
                         **{f"R_{n}": (round(per[n]['R'],4) if per[n]['R'] is not None else "")
                            for n in NAMES},
                         "macro_R": round(macro['R'],4), "macro_P": round(macro['P'],4),
                         "macro_F1": round(macro['F1'],4)})
        print("  " + "-"*92)
        print("\n  ※ 값이 거의 안 움직이면 놓침이 '검출 실패' 가 아니라 '오분류' 라는 뜻이다.")
        print("     그 경우 --mode weights 로 2순위 후보를 살리는 쪽을 봐야 한다.")

    else:
        print(hdr); print("  " + "-"*92)
        base_per, base_macro = score(per_img, truths, ones, a.conf)
        show_row("가중치 없음", base_per, base_macro)
        best_w, best = list(ones), base_macro["R"]

        # 좌표 상승법: 희소 클래스부터 한 축씩 훑는다 (5차원 격자탐색은 비현실적)
        order = sorted(range(5), key=lambda c: cnt[c])
        grid  = [0.7, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0]
        for _pass in range(2):
            for c in order:
                cand_w, cand_best = None, best
                for g in grid:
                    trial = list(best_w); trial[c] = g
                    _, m = score(per_img, truths, trial, a.conf)
                    if m["R"] > cand_best + 1e-6:
                        cand_best, cand_w = m["R"], trial
                if cand_w:
                    best_w, best = cand_w, cand_best
                    per, macro = score(per_img, truths, best_w, a.conf)
                    show_row(f"{NAMES[c][:6]}×{best_w[c]:.1f}", per, macro)

        per, macro = score(per_img, truths, best_w, a.conf)
        print("  " + "-"*92)
        print(f"\n  최종 가중치: " + "  ".join(f"{n}={best_w[i]:.1f}" for i, n in enumerate(NAMES)))
        print(f"  macro Recall {base_macro['R']:.4f} → {macro['R']:.4f}"
              f"  ({(macro['R']-base_macro['R'])*100:+.2f}%p)")
        print(f"  macro Precision {base_macro['P']:.4f} → {macro['P']:.4f}"
              f"  ({(macro['P']-base_macro['P'])*100:+.2f}%p)")
        print(f"\n  ※ 개선폭이 0 에 가까우면 2순위 후보의 점수가 너무 낮아 뒤집히지 않는")
        print(f"     것이다. 그것도 유효한 결과다 - 억지로 숫자를 만들지 않는다.")
        print(f"  ※ 실제 적용은 후처리 변경이 필요하다. ai_server 는 argmax 결과만 받으므로,")
        print(f"     가중치를 쓰려면 multi_label 추론 + 재argmax 를 넣어야 한다.")
        rows.append({"mode": "weights", "conf": a.conf,
                     "weights": ",".join(f"{x:.1f}" for x in best_w),
                     **{f"R_{n}": (round(per[n]['R'],4) if per[n]['R'] is not None else "")
                        for n in NAMES},
                     "macro_R": round(macro['R'],4), "macro_P": round(macro['P'],4),
                     "macro_F1": round(macro['F1'],4)})

    OUT.mkdir(exist_ok=True)
    p = OUT / f"{a.model}_{a.split}_tune_{a.mode}.csv"
    with open(p, "w", newline="") as f:
        wc = csv.DictWriter(f, fieldnames=list(rows[0])); wc.writeheader(); wc.writerows(rows)
    print(f"\n  기록: {p}")


if __name__ == "__main__":
    main()
