"""촬영 배치별(202209 / 202210) 평가용 yaml 을 만든다.

배치 편향 때문에 전체 성적만 보면 안 된다. 정상은 202209 에, 결함은 202210 에
몰려 있고 종횡비까지 달라서, 모델이 결함이 아니라 배치를 외워도 성적이 좋게 나온다.
배치별로 나눠 채점해야 그 차이가 드러난다.

ultralytics 는 data yaml 의 train/val/test 에 '이미지 경로가 한 줄씩 적힌 txt' 를
받아들인다. 그걸 이용해 배치별 목록을 만든다.
"""
import sys
from pathlib import Path

ROOT = Path("/home/jovyan/data/egg/color")
OUT  = Path("/home/jovyan/data/egg/splits")
NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]


def build(batch, splits=("val", "test")):
    OUT.mkdir(parents=True, exist_ok=True)
    lines = {}
    for sp in splits:
        imgs = sorted((ROOT / "images" / sp).glob(f"{batch}*.jpg"))
        txt = OUT / f"{batch}_{sp}.txt"
        txt.write_text("\n".join(str(p) for p in imgs) + "\n")
        lines[sp] = (txt, len(imgs))

    yml = OUT / f"color_{batch}.yaml"
    body = ["path: /home/jovyan/data/egg/color"]
    # ultralytics 의 check_det_dataset 은 train/val 키가 둘 다 있어야 통과시킨다.
    # 평가에만 쓰는 yaml 이라 train 은 실제로 읽히지 않지만 키는 있어야 한다.
    body.append(f"train: {lines[splits[0]][0]}")
    for sp in splits:
        body.append(f"{sp}: {lines[sp][0]}")
    if "val" not in splits:
        body.append(f"val: {lines[splits[0]][0]}")
    body.append("")
    body.append("names:")
    body += [f"  {i}: {n}" for i, n in enumerate(NAMES)]
    yml.write_text("\n".join(body) + "\n")
    return yml, {sp: n for sp, (_, n) in lines.items()}


if __name__ == "__main__":
    for b in ("202209", "202210"):
        y, cnt = build(b)
        print(f"  {y}   " + "  ".join(f"{sp}={n}" for sp, n in cnt.items()))
