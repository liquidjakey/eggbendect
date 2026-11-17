"""모델 1개를 학습한다. test 평가는 하지 않는다.

사용법 (작업 위치는 /home/jovyan 고정 — runs/ 가 갈라지지 않게):
    python3 work/color/train_one.py yolo11m
    python3 work/color/train_one.py rtdetr-l [batch]

- 중간에 죽었다가 다시 실행하면 last.pt 에서 자동으로 이어서 돈다.
- 이미 끝난 모델을 다시 실행하면 아무것도 하지 않는다.
- test 셋은 열지 않는다. 최종 시험지라 evaluate.py 로 따로, 한 번만 연다.
- 끝나면 발표용 그래프·csv·best.pt 를 /home/jovyan/results/<모델>/ 에 모아둔다.
  (내려받기 편하라고 한 곳에 모으는 것이지 백업이 아니다. PVC 가 날아가면 같이 사라지므로
   모델이 끝날 때마다 로컬 PC 로 직접 받아두는 것이 유일한 확실한 보관이다.)
"""
import sys, os, time, shutil
sys.path.insert(0, "/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)

from pathlib import Path
from ultralytics import YOLO, RTDETR

mdl   = sys.argv[1]
batch = int(sys.argv[2]) if len(sys.argv) > 2 else COMMON["batch"]
cfg   = {**COMMON, "batch": batch, "name": mdl, "project": "/home/jovyan/runs/detect"}

run  = Path(cfg["project"]) / mdl
last = run / "weights" / "last.pt"
done = run / "TRAIN_DONE"
Loader = RTDETR if mdl.startswith("rtdetr") else YOLO

t0 = time.time()
if done.exists():
    print(f"[건너뜀] {mdl} 학습은 이미 완료됨"); sys.exit(0)
elif last.exists():
    print(f"[재개] {last} 에서 이어서 학습", flush=True)
    Loader(str(last)).train(resume=True)
else:
    print(f"[신규] {mdl} 학습 시작  (batch={batch}, epochs={cfg['epochs']})", flush=True)
    Loader(f"{mdl}.pt").train(**cfg)
sec = time.time() - t0
done.write_text(str(sec))

# 발표 자료를 한 곳에 모은다 (내려받기 편하도록). results/ 는 .gitignore 에 있다.
# ※ /tmp/vgpu 는 쓰지 않는다 - 노드의 vGPU 런타임 작업 디렉터리라 우리 저장소가 아니고,
#   전체 권한이 열려 있어 재배포 금지 데이터를 두면 안 된다.
bak = Path(f"/home/jovyan/results/{mdl}"); bak.mkdir(parents=True, exist_ok=True)
# ★ ultralytics 8.4 부터 곡선 파일명에 'Box' 접두사가 붙는다 (BoxPR_curve.png).
#   구버전 이름도 함께 넣어 어느 쪽이든 복사되게 한다.
for f in ("confusion_matrix.png", "confusion_matrix_normalized.png",
          "BoxPR_curve.png", "BoxP_curve.png", "BoxR_curve.png", "BoxF1_curve.png",
          "PR_curve.png", "P_curve.png", "R_curve.png", "F1_curve.png",
          "results.csv", "results.png", "args.yaml"):
    if (run/f).exists(): shutil.copy2(run/f, bak/f)
shutil.copy2(run/"weights"/"best.pt", bak/"best.pt")

print("\n" + "="*62)
print(f"  {mdl} 학습 완료 — {sec/3600:.2f} 시간")
print(f"  best.pt : {run/'weights'/'best.pt'}")
print(f"  모아둠  : {bak}   ← 로컬 PC 로 받아두세요")
print("="*62)
print("※ test 평가는 이 스크립트가 하지 않는다.")
