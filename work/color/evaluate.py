"""학습된 모델을 채점한다. 클래스별 지표 + macro + 촬영배치별 분리 채점.

사용법
    python3 work/color/evaluate.py yolo11m                      # val 셋 (연습·튜닝용)
    python3 work/color/evaluate.py yolo11m --split test --yes   # test 셋 (최종 성적표)
    python3 work/color/evaluate.py yolo11m --conf 0.15          # 임계값 지정

왜 클래스별로 보나
    results.csv 에는 5개 클래스의 평균만 남는다. 어떤 클래스를 못 맞히는지는
    학습이 끝난 뒤 이 스크립트로만 알 수 있다.

왜 macro 인가
    NORMAL 과 FOREIGN_MATERIAL 이 전체의 77% 다. 개수로 가중평균하면 DEFORMED
    (5%) 를 다 놓쳐도 지표에 거의 안 잡힌다. 클래스마다 1/5 씩 무게를 주는
    macro 로 봐야 약한 클래스가 드러난다.
    ※ ultralytics 의 'all' 행이 곧 macro 다 (클래스별 값의 단순 평균).

왜 배치별로 나누나
    정상은 202209(960x853), 결함은 202210(960x720) 에 몰려 있다. 모델이 결함이
    아니라 "어느 배치 사진인가" 로 답해도 전체 성적은 좋게 나온다. 나눠서 재야
    그 차이가 보인다. 두 배치의 격차가 클수록 지름길에 기댄 것이다.

★ test 는 최종 시험지다. --yes 를 붙여야 열린다. val 로 튜닝하고 test 는 한 번만.
"""
import argparse, csv, json, sys, time
from pathlib import Path

sys.path.insert(0, "/home/jovyan/work/color")
from common import COMMON, setup_threads
setup_threads(8)

from ultralytics import YOLO, RTDETR

NAMES = ["NORMAL", "CRACK", "FOREIGN_MATERIAL", "DISCOLORATION", "DEFORMED"]

# ★ 표본이 적으면 Recall 값 자체가 의미를 잃는다.
#   n=10 이면 정답 하나 차이로 10%p 가 움직인다. 그런 값을 17,000 개짜리 클래스와
#   같은 1/5 무게로 평균하면 macro 가 표본 잡음에 끌려다닌다.
#   측정할 수 없는 것을 측정한 척하지 않는다 - 값을 숨기지는 않되 평균에서는 뺀다.
#   배치별 채점에서 실제로 발생한다 (test 기준 202209 의 DEFORMED 는 10 개뿐).
MIN_SUPPORT_MACRO = 30     # 이 미만이면 macro 평균에서 제외
MIN_SUPPORT_TRUST = 100    # 이 미만이면 값 옆에 주의 표시
RUNS  = Path("/home/jovyan/runs/detect")
OUT   = Path("/home/jovyan/results")
SPLITS = Path("/home/jovyan/data/egg/splits")


def f1(p, r):
    return 2 * p * r / (p + r) if (p + r) else 0.0


def evaluate(model, data, split, conf, tag):
    """한 데이터셋에 대해 채점하고 클래스별 지표를 뽑는다."""
    t0 = time.time()
    res = model.val(data=data, split=split, conf=conf, batch=COMMON["batch"],
                    plots=False, verbose=False, save_json=False,
                    project=str(RUNS / "eval"), name=tag, exist_ok=True)
    dt = time.time() - t0
    b = res.box
    # 클래스별 정답 개수(support). nt_per_class 는 res(DetMetrics) 에 있다 - res.box 가 아니다.
    nt = getattr(res, "nt_per_class", None)
    support = {NAMES[i]: int(nt[i]) for i in range(len(NAMES))} if nt is not None else {}

    per = {}
    for i, cid in enumerate(b.ap_class_index):
        p, r, ap50, ap = b.class_result(i)
        n = NAMES[int(cid)]
        per[n] = {"P": float(p), "R": float(r), "F1": f1(float(p), float(r)),
                  "mAP50": float(ap50), "mAP50-95": float(ap),
                  "support": support.get(n, 0)}
    # ★ 데이터에 정답이 하나도 없는 클래스는 ap_class_index 에 안 들어온다.
    #   그런 클래스를 0 으로 채워 평균하면 macro 가 실제보다 낮게 나온다.
    #   못 맞힌 게 아니라 잴 수 없는 것이므로 평균에서 제외하고 '-' 로 표시한다.
    #   (배치별 채점에서 실제로 발생한다 - 202209 에는 CRACK 0.2%, DEFORMED 0.1%)
    for n in NAMES:
        per.setdefault(n, None)

    # 정답이 없거나(측정 불가) 표본이 너무 적은(잡음 지배) 클래스는 평균에서 뺀다
    have = [n for n in NAMES
            if per[n] is not None and per[n]["support"] >= MIN_SUPPORT_MACRO]

    macro = {k: (sum(per[n][k] for n in have) / len(have) if have else 0.0)
             for k in ("P", "R", "F1")}
    macro["classes_used"] = have
    return {
        "per_class": per,
        "macro_P": macro["P"], "macro_R": macro["R"], "macro_F1": macro["F1"],
        "classes_used": have,
        "mAP50": float(b.map50), "mAP50_95": float(b.map),
        "speed_ms": float(sum(res.speed.values())),
        "elapsed_s": round(dt, 1),
    }


def show(title, m):
    used = set(m["classes_used"])
    print(f"\n  [{title}]")
    print(f"    {'클래스':<20}{'n':>7}{'P':>8}{'R':>8}{'F1':>8}{'mAP50':>9}   비고")
    print("    " + "-" * 72)
    for n in NAMES:
        c = m["per_class"][n]
        if c is None:
            print(f"    {n:<20}{0:>7}{'-':>8}{'-':>8}{'-':>8}{'-':>9}   정답 없음 → macro 제외")
            continue
        sup = c["support"]
        if sup < MIN_SUPPORT_MACRO:
            note = f"n<{MIN_SUPPORT_MACRO} → macro 제외 (참고값)"
        elif sup < MIN_SUPPORT_TRUST:
            note = f"⚠ 표본 적음 (1개당 {100/sup:.1f}%p)"
        else:
            note = ""
        print(f"    {n:<20}{sup:>7,}{c['P']:>8.3f}{c['R']:>8.3f}{c['F1']:>8.3f}"
              f"{c['mAP50']:>9.3f}   {note}")
    print("    " + "-" * 72)
    print(f"    {f'macro ({len(used)}클래스)':<20}{'':>7}{m['macro_P']:>8.3f}{m['macro_R']:>8.3f}"
          f"{m['macro_F1']:>8.3f}{m['mAP50']:>9.3f}   {', '.join(used)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--split", default="val", choices=["val", "test"])
    # ★ mAP 는 PR 곡선 전체 면적이라 낮은 conf 까지 포함해 계산해야 한다.
    #   conf=0.25 를 넘기면 곡선 꼬리가 잘려 mAP 가 과소평가된다 (실측 0.957 → 0.911).
    #   ultralytics 는 이 설정에서 P/R 을 F1 최대 지점 기준으로 보고한다 - 표준 방식이고
    #   이전 환경의 yolo11n 수치와도 같은 기준이다.
    #   운영 문턱에서의 Recall 은 tune_conf.py 가 따로 다룬다.
    ap.add_argument("--conf", type=float, default=0.001,
                    help="mAP 정확도를 위해 기본 0.001. 올리면 mAP 가 과소평가된다")
    ap.add_argument("--yes", action="store_true", help="test 셋을 열겠다는 확인")
    # 이전 환경에서 학습돼 저장소에만 남은 가중치(yolo11n)를 채점할 때 쓴다.
    ap.add_argument("--weights", default=None,
                    help="runs/detect/<model>/weights/best.pt 가 아닌 경로를 쓸 때")
    a = ap.parse_args()

    if a.split == "test" and not a.yes:
        sys.exit("test 는 최종 시험지다. 정말 열려면 --yes 를 붙여라.\n"
                 "  튜닝은 val 로 하고, test 는 확정된 설정으로 한 번만 연다.")

    w = Path(a.weights) if a.weights else RUNS / a.model / "weights" / "best.pt"
    if not w.exists():
        sys.exit(f"가중치가 없다: {w}")

    Loader = RTDETR if a.model.startswith("rtdetr") else YOLO
    model = Loader(str(w))

    print("=" * 62)
    print(f"  {a.model}  ·  {a.split} 셋  ·  conf={a.conf}")
    print("=" * 62)

    groups = [("전체", COMMON["data"]),
              ("202209 (960x853)", str(SPLITS / "color_202209.yaml")),
              ("202210 (960x720)", str(SPLITS / "color_202210.yaml"))]

    out = {}
    for title, data in groups:
        out[title] = evaluate(model, data, a.split, a.conf,
                              f"{a.model}_{a.split}_{title.split()[0]}")
        show(title, out[title])

    g9, g10 = out["202209 (960x853)"], out["202210 (960x720)"]
    print("\n" + "=" * 62)
    print(f"  배치 격차 (지름길 의존도)")
    print(f"    ※ 배치별 macro 는 표본이 충분한 클래스만으로 낸 값이라 서로 다른")
    print(f"       클래스 집합을 평균했을 수 있다. 위 표의 '비고' 열을 함께 볼 것.")
    print(f"    macro Recall   202209 {g9['macro_R']:.3f}  vs  202210 {g10['macro_R']:.3f}"
          f"   차이 {abs(g9['macro_R']-g10['macro_R']):.3f}")
    _d = lambda g: (f"{g['per_class']['DISCOLORATION']['R']:.3f}"
                    f" (n={g['per_class']['DISCOLORATION']['support']:,})"
                    if g['per_class']['DISCOLORATION'] else "-")
    print(f"    DISCOLORATION  202209 {_d(g9)}"
          f"  vs  202210 {_d(g10)}"
          f"   ← 두 배치에 고르게 있는 유일한 클래스(대조군)")
    print("=" * 62)

    OUT.mkdir(exist_ok=True)
    json.dump(out, open(OUT / f"{a.model}_{a.split}_conf{a.conf}.json", "w"),
              indent=2, ensure_ascii=False)

    row = {"model": a.model, "split": a.split, "conf": a.conf,
           "mAP50": round(out["전체"]["mAP50"], 4),
           "mAP50_95": round(out["전체"]["mAP50_95"], 4),
           "macro_P": round(out["전체"]["macro_P"], 4),
           "macro_R": round(out["전체"]["macro_R"], 4),
           "macro_F1": round(out["전체"]["macro_F1"], 4),
           "speed_ms": round(out["전체"]["speed_ms"], 2),
           "size_MB": round(w.stat().st_size / 1024**2, 1),
           "macro_R_202209": round(g9["macro_R"], 4),
           "macro_R_202210": round(g10["macro_R"], 4)}
    for n in NAMES:
        c = out["전체"]["per_class"][n]
        row[f"R_{n}"] = round(c["R"], 4) if c else ""
        row[f"n_{n}"] = c["support"] if c else 0

    csv_path = OUT / "experiments.csv"
    new = not csv_path.exists()
    with open(csv_path, "a", newline="") as f:
        wcsv = csv.DictWriter(f, fieldnames=list(row))
        if new: wcsv.writeheader()
        wcsv.writerow(row)
    print(f"\n  기록: {csv_path}")


if __name__ == "__main__":
    main()
