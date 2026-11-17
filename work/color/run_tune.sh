#!/bin/bash
# 후처리 튜닝을 세션과 분리해 띄운다.
#   bash work/color/run_tune.sh <모델> <mode> [추가인자...]
set -u
cd /home/jovyan
MDL="$1"; MODE="$2"; shift 2
export OMP_NUM_THREADS=8 MKL_NUM_THREADS=8
LOG="logs/tune_${MDL}_${MODE}.log"
setsid python3 work/color/tune_conf.py "$MDL" --mode "$MODE" "$@" > "$LOG" 2>&1 < /dev/null &
sleep 6
pgrep -f "^python3 work/color/tune_conf.py $MDL" >/dev/null \
  && echo "launched: $MDL $MODE -> $LOG" || { echo "failed:"; tail -3 "$LOG" | grep -v HAMI; }
