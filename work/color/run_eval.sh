#!/bin/bash
# 평가를 세션과 분리해서 띄운다.
#   bash work/color/run_eval.sh <모델명> <split> [추가인자...]
# 예) bash work/color/run_eval.sh yolo11n val --weights /home/jovyan/work/color_result/color_yolo11n.pt
#
# 세션이 끊겨도 평가가 살아남게 setsid 로 새 세션에서 돌린다.
set -u
cd /home/jovyan
MDL="$1"; SPLIT="$2"; shift 2

export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8

LOG="logs/eval_${MDL}_${SPLIT}.log"
setsid python3 work/color/evaluate.py "$MDL" --split "$SPLIT" "$@" \
    > "$LOG" 2>&1 < /dev/null &
sleep 6
if pgrep -f "^python3 work/color/evaluate.py $MDL" >/dev/null; then
    echo "launched: $MDL $SPLIT  -> $LOG"
else
    echo "failed - 로그 마지막 줄:"
    tail -3 "$LOG" | grep -v HAMI
fi
