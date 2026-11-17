"""batch 상향 효과 측정. COMMON 을 바꾸는 게 아니라 '바꾸면 얼마나 빨라지는지'만 잰다.
팀 합의 없이는 batch=8 을 유지한다."""
import sys, time, json, re
sys.path.insert(0,"/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)
import torch
from ultralytics import YOLO, RTDETR
TRAIN=38831; res={}
for tag,L,ck in [("yolo11m",YOLO,"yolo11m.pt"),("rtdetr-l",RTDETR,"rtdetr-l.pt")]:
    for bs in (16,32):
        key=f"{tag}_b{bs}"
        print(f"\n{'='*60}\n  {key}\n{'='*60}",flush=True)
        try:
            torch.cuda.reset_peak_memory_stats(); t0=time.time()
            L(ck).train(**{**COMMON,"epochs":1,"fraction":0.2,"batch":bs,"val":False,
                           "plots":False,"name":key,"project":"/home/jovyan/runs/bench","exist_ok":True})
            res[key]={"wall_s":round(time.time()-t0,1),
                      "peak_gpu_gib":round(torch.cuda.max_memory_reserved()/1024**3,2)}
        except torch.cuda.OutOfMemoryError:
            res[key]={"error":"OOM"}; torch.cuda.empty_cache()
        print(f"[{key}] {res[key]}",flush=True)
        json.dump(res, open("/home/jovyan/logs/bench_batch.json","w"), indent=2)
print(json.dumps(res,indent=2))
