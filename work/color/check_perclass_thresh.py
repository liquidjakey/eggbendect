"""멘토 제안(클래스별 threshold)의 효과 상한을 실측한다.

두 방식의 차이
  클래스별 threshold : 이미 argmax 로 정해진 검출을 '남길지 버릴지' 만 정한다.
                       클래스를 바꾸지는 못한다.
  클래스 가중치      : 어느 클래스로 판정할지 자체를 바꾼다.

우리 문제의 오류가 '검출 실패' 면 threshold 가 듣고, '오분류' 면 안 듣는다.
그래서 top-1 점수 분포를 보면 threshold 방식의 상한을 알 수 있다.
  - 점수가 0.25 아래인 계란 = 문턱을 낮추면 살아날 수 있는 계란
  - 그런 계란이 거의 없다면 threshold 를 아무리 조절해도 얻을 게 없다
"""
import collections
import glob
import sys

sys.path.insert(0, "/home/jovyan/src/core/ai_server")
from PIL import Image

from app import model

NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 200

model.load_model()
imgs = sorted(glob.glob("/home/jovyan/data/egg/color/images/test/*.jpg"))
imgs = [imgs[int(i * len(imgs) / N)] for i in range(N)]

BANDS = [(0.01, 0.10), (0.10, 0.25), (0.25, 0.50), (0.50, 0.80), (0.80, 1.01)]
band_cnt = {n: collections.Counter() for n in NAMES}
tot = 0

for i, p in enumerate(imgs):
    # 기존 서비스 경로와 동일: argmax 1개 + agnostic_nms
    r = model._model.predict(source=Image.open(p), conf=0.01, device="cpu",
                             agnostic_nms=True, verbose=False)[0]
    for b in r.boxes:
        c = NAMES[int(b.cls.item())]
        s = float(b.conf.item())
        tot += 1
        for lo, hi in BANDS:
            if lo <= s < hi:
                band_cnt[c][(lo, hi)] += 1
                break
    if (i + 1) % 100 == 0:
        print(f"  {i+1}/{len(imgs)}", flush=True)

print(f"\ntest {len(imgs)}판 · 검출 {tot:,}개 · top-1 점수 분포\n")
hdr = "  " + f"{'클래스':<20}" + "".join(f"{f'{lo}~{hi}':>12}" for lo, hi in BANDS)
print(hdr)
print("  " + "-" * (20 + 12 * len(BANDS)))
for n in NAMES:
    row = "".join(f"{band_cnt[n][b]:>12,}" for b in BANDS)
    print(f"  {n:<20}{row}")

print("\n  문턱을 0.25 -> 0.01 로 낮췄을 때 새로 살아나는 검출")
for n in NAMES:
    gain = band_cnt[n][(0.01, 0.10)] + band_cnt[n][(0.10, 0.25)]
    keep = sum(band_cnt[n][b] for b in BANDS[2:])
    print(f"    {n:<20} +{gain:>5,}개   (현재 {keep:,}개 대비 {gain/max(keep,1)*100:5.1f}%)")
print("\n  ※ 이 숫자가 작으면 클래스별 threshold 로 얻을 수 있는 최대치가 그만큼이다.")
