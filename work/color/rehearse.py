"""리허설 — 본 학습 전 파이프라인·속도·GPU 메모리 점검.

fraction=0.01 로 데이터 1% 만 써서 2 epoch 돌린다.
목적은 성능이 아니라 (1) 끝까지 도는가 (2) batch=8 이 GPU 에 들어가는가
(3) 실제 it/s 가 얼마인가 — 이걸로 본 학습 ETA 를 역산한다.
"""
import sys, time, json
sys.path.insert(0, "/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)

import torch
from ultralytics import YOLO, RTDETR

TRAIN_IMGS = 38831
ITERS_PER_EPOCH = TRAIN_IMGS / COMMON["batch"]
out = {}

for tag, Loader, ckpt in [("rtdetr-l", RTDETR, "rtdetr-l.pt"),
                          ("yolo11m",  YOLO,   "yolo11m.pt")]:
    print(f"\n{'='*70}\n  리허설: {tag}\n{'='*70}", flush=True)
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    m = Loader(ckpt)
    m.train(**{**COMMON, "epochs": 2, "fraction": 0.01,
               "name": f"rehearse_{tag}", "project": "runs/rehearsal",
               "val": False, "plots": False})
    dt = time.time() - t0
    peak = torch.cuda.max_memory_reserved() / 1024**3
    out[tag] = {"elapsed_s": round(dt, 1), "peak_gpu_gib": round(peak, 2)}
    print(f"\n[{tag}] 소요 {dt:.1f}s · GPU 피크 {peak:.2f} GiB", flush=True)

print("\n" + "="*70)
print(json.dumps(out, indent=2))
json.dump(out, open("/home/jovyan/logs/rehearsal.json", "w"), indent=2)
