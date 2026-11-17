"""COLOR 학습 공통 설정.

★ COMMON 값은 MONO 담당자와 반드시 동일해야 비교표가 성립한다.
  workers 만 노드별로 다름 (이 노드의 cgroup CPU 상한은 8).

★ OMP_NUM_THREADS 는 COMMON 이 아니라 노드 환경 설정이다.
  nproc 이 64 를 반환하지만 실제 cgroup 할당은 8 이라, 안 잡으면
  스레드 64 개가 코어 8 개를 두고 싸워 학습이 크게 느려진다.
  (이전 환경에서 6배 감속 사례) 결과에는 영향이 없고 속도만 바뀐다.
"""
import os

def setup_threads(n=8):
    os.environ["OMP_NUM_THREADS"] = str(n)
    os.environ["MKL_NUM_THREADS"] = str(n)
    import torch
    torch.set_num_threads(n)

COMMON = dict(
    data     = "/home/jovyan/data/egg/color/color.yaml",
    epochs   = 100,
    imgsz    = 640,
    batch    = 32,     # ★ 8 → 32 변경 (2026-08-24, 팀 합의 필요 항목)
                       #   근거: 실측 batch=8 은 GPU 사용률 41~54% · 메모리 5.1G/28.6G 로
                       #   절반도 못 쓰고 데이터로더에 묶여 있었다. 32 로 올리면
                       #   yolo11m 16.4h→8.0h, rtdetr-l 43.5h→22.5h (약 2배 단축).
                       #   ※ MONO 담당자도 동일하게 32 로 올려야 비교표가 성립한다.
    workers  = 8,      # ★ 노드별 조정 허용 항목 (vCPU 8)
    seed     = 42,
    patience = 20,
    plots    = True,
)
