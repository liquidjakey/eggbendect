"""현재 학습 현황을 한 번에 보여준다.  사용법: python status.py [모델명]"""
import csv, subprocess, sys, time
from pathlib import Path

mdl = sys.argv[1] if len(sys.argv) > 1 else "yolo11n"
run = Path("runs/detect") / mdl
csv_path = run / "results.csv"
col = lambda ks, w: next(k for k in ks if w in k)

def sh(c):
    try: return subprocess.run(c, shell=True, capture_output=True, text=True).stdout.strip()
    except Exception: return "?"

print("=" * 78)
print(f"  {mdl}  현황    ({time.strftime('%m/%d %H:%M')})")
print("=" * 78)

alive = sh("pgrep -f 'train_one.py' | head -1")
print(f"  학습 프로세스 : {'실행 중 (PID ' + alive + ')' if alive else '없음 — 종료되었거나 아직 시작 안 함'}")
print(f"  GPU           : {sh('nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader 2>/dev/null | tail -1')}")
disk = sh("df -h /home/jovyan").split("\n")[-1].split()[3]
print(f"  디스크 여유   : {disk}")

if not csv_path.exists():
    print("\n  아직 results.csv 없음 (첫 에폭 진행 중)"); sys.exit()

rows = list(csv.DictReader(open(csv_path)))
ks = rows[0].keys()
print(f"\n{'ep':>4} {'분':>6} {'box':>7} {'cls':>7} {'val_box':>8} {'val_cls':>8} {'mAP50':>8} {'mAP50-95':>9} {'Recall':>8}")
print("-" * 78)
prev = 0.0
for r in rows:
    t = float(r[col(ks, "time")])
    print(f"{int(r['epoch']):>4} {(t-prev)/60:>6.1f} "
          f"{float(r[col(ks,'train/box_loss')]):>7.4f} {float(r[col(ks,'train/cls_loss')]):>7.4f} "
          f"{float(r[col(ks,'val/box_loss')]):>8.4f} {float(r[col(ks,'val/cls_loss')]):>8.4f} "
          f"{float(r[col(ks,'mAP50(')]):>8.4f} {float(r[col(ks,'mAP50-95')]):>9.4f} "
          f"{float(r[col(ks,'recall')]):>8.4f}")
    prev = t

n, tot = len(rows), float(rows[-1][col(ks, "time")])
best = max(float(r[col(ks, "mAP50(")]) for r in rows)
best_ep = [int(r["epoch"]) for r in rows if float(r[col(ks, "mAP50(")]) == best][0]
print("-" * 78)
print(f"  완료 {n}/100 에폭 | 에폭당 평균 {tot/n/60:.1f}분")
print(f"  최고 mAP50 {best:.4f} (에폭 {best_ep}) | 그 뒤 {n-best_ep}에폭째 개선 없음 (patience 20)")
print(f"  남은 예상 {(tot/n)*(100-n)/3600:.1f}시간 -> "
      f"{time.strftime('%m/%d %H:%M', time.localtime(time.time() + (tot/n)*(100-n)))} 경 완료")
print("\n  ※ 클래스별 Recall(CRACK 등)은 results.csv 에 없다.")
print("     ultralytics 가 에폭마다 전체 평균만 기록하기 때문이며,")
print("     클래스별 수치는 학습 종료 후 evaluate.py 로 확인한다.")
