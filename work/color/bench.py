"""정확한 처리량 측정 — fraction=0.1 (3,883장 = 486 iter) 1 epoch.
워커 워밍업 이후 안정 구간의 it/s 를 재서 본 학습 ETA 를 역산한다."""
import sys, time, json
sys.path.insert(0, "/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)
import torch
from ultralytics import YOLO, RTDETR

res={}
for tag, L, ck in [("yolo11m", YOLO, "yolo11m.pt"), ("rtdetr-l", RTDETR, "rtdetr-l.pt")]:
    print(f"\n{'='*60}\n  벤치: {tag}\n{'='*60}", flush=True)
    torch.cuda.reset_peak_memory_stats(); t0=time.time()
    L(ck).train(**{**COMMON, "epochs":1, "fraction":0.1, "val":False, "plots":False,
                   "name":f"bench_{tag}", "project":"/home/jovyan/runs/bench", "exist_ok":True})
    res[tag]={"wall_s":round(time.time()-t0,1),
              "peak_gpu_gib":round(torch.cuda.max_memory_reserved()/1024**3,2)}
    print(f"[{tag}] {res[tag]}", flush=True)
json.dump(res, open("/home/jovyan/logs/bench.json","w"), indent=2)
print(json.dumps(res, indent=2))
