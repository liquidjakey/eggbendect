"""판정 기준 보정이 '결함을 정상으로' 바꾸는 일이 있는지 확인한다.

멘토 피드백: "정상·이물질 Recall 이 낮아지는 건 리스크가 있다"

리스크의 실체를 갈라봐야 한다.
  결함 → 정상        불량을 놓친다. 진짜 위험. 이게 0 이어야 한다
  정상 → 결함        멀쩡한 계란을 걸러낸다. 경제적 손실이지 안전 문제는 아니다
  결함 → 다른 결함   유형만 바뀐다. 여전히 불량으로 걸러진다

사용법: python3 work/color/check_flip_risk.py [이미지수] [split]
"""
import collections
import functools
import glob
import sys

sys.path.insert(0, "/home/jovyan/src/core/ai_server")
from PIL import Image

from app import model
from ultralytics.utils import nms as _nmsmod

NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SPLIT = sys.argv[2] if len(sys.argv) > 2 else "test"

model.load_model()
W = model._parse_weights()
ONE = [1.0] * 5

imgs = sorted(glob.glob(f"/home/jovyan/data/egg/color/images/{SPLIT}/*.jpg"))
imgs = [imgs[int(i * len(imgs) / N)] for i in range(N)]

_orig = _nmsmod.non_max_suppression


@functools.wraps(_orig)
def _ml(*a, **k):
    k["multi_label"] = True
    return _orig(*a, **k)


tot = 0
M = collections.Counter()
_nmsmod.non_max_suppression = _ml
try:
    for i, p in enumerate(imgs):
        r = model._model.predict(source=Image.open(p), conf=0.01, device="cpu",
                                 agnostic_nms=False, max_det=300, verbose=False)[0]
        c = [(int(b.cls.item()), float(b.conf.item()), b.xyxy[0].tolist()) for b in r.boxes]
        c.sort(key=lambda x: -x[1])
        a = [x for x in model._reweight(c, ONE) if x[1] >= 0.25]
        b = [x for x in model._reweight(c, W) if x[1] >= 0.25]
        key = lambda z: (round(z[2][1]), round(z[2][0]))
        for x, y in zip(sorted(a, key=key), sorted(b, key=key)):
            tot += 1
            if x[0] != y[0]:
                M[(NAMES[x[0]], NAMES[y[0]])] += 1
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(imgs)}", flush=True)
finally:
    _nmsmod.non_max_suppression = _orig

print(f"\n{SPLIT} {len(imgs)}판 · 계란 {tot:,}개 · 변경 {sum(M.values())}개 "
      f"({sum(M.values())/max(tot,1)*100:.1f}%)\n")
print("  보정 전 → 보정 후")
for (a, b), v in M.most_common():
    tag = "  ⚠️ 결함→정상 (불량 놓침)" if b == "NORMAL" and a != "NORMAL" else \
          ("  ← 정상→결함 (헛짚음)" if a == "NORMAL" else "  (여전히 불량)")
    print(f"    {a:<18} → {b:<18} {v:>4}개{tag}")

d2n = sum(v for (a, b), v in M.items() if b == "NORMAL" and a != "NORMAL")
n2d = sum(v for (a, b), v in M.items() if a == "NORMAL" and b != "NORMAL")
dd = sum(v for (a, b), v in M.items() if a != "NORMAL" and b != "NORMAL")
print(f"\n  ★ 결함 → 정상 (불량 놓침) : {d2n}개    ← 0 이어야 안전")
print(f"    정상 → 결함 (헛짚음)     : {n2d}개    경제적 손실, 2차가 재검사")
print(f"    결함 → 다른 결함         : {dd}개    유형만 바뀜, 여전히 걸러짐")
