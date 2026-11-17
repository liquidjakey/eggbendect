"""에폭이 끝날 때마다 사람이 읽기 좋은 한 줄을 logs/progress.log 에 남긴다.

results.csv 는 ultralytics 가 에폭마다 한 줄씩 추가하므로, 그걸 지켜보다가
새 줄이 생기면 해석을 붙여서 기록한다. 학습에는 전혀 영향을 주지 않는다.
"""
import csv, time, sys
from pathlib import Path

mdl = sys.argv[1] if len(sys.argv) > 1 else "yolo11n"
csv_path = Path("runs/detect") / mdl / "results.csv"
out = Path("logs/progress.log")

def col(keys, want):
    return next(k for k in keys if want in k)

def fmt(rows, i, prev_t, best):
    r = rows[i]; ks = r.keys()
    t   = float(r[col(ks, "time")])
    m50 = float(r[col(ks, "mAP50(")])
    m95 = float(r[col(ks, "mAP50-95")])
    rec = float(r[col(ks, "recall")])
    vb  = float(r[col(ks, "val/box_loss")])
    vc  = float(r[col(ks, "val/cls_loss")])
    ep  = int(r["epoch"])
    mark = " ★최고" if m50 >= best else ""
    eta = (t / ep) * (100 - ep) / 3600
    return (f"[{time.strftime('%m/%d %H:%M')}] {mdl} "
            f"ep {ep:>3}/100 | {(t-prev_t)/60:4.1f}분 | "
            f"mAP50 {m50:.4f} | mAP50-95 {m95:.4f} | Recall {rec:.4f} | "
            f"val손실 box {vb:.4f} cls {vc:.4f} | 남은예상 {eta:4.1f}h{mark}"), t, max(best, m50)

seen, prev_t, best = 0, 0.0, 0.0
out.parent.mkdir(exist_ok=True)
while True:
    if csv_path.exists():
        try:
            rows = list(csv.DictReader(open(csv_path)))
        except Exception:
            rows = []
        while seen < len(rows):
            line, prev_t, best = fmt(rows, seen, prev_t, best)
            print(line, flush=True)
            with open(out, "a") as f:
                f.write(line + "\n")
            seen += 1
    time.sleep(20)
