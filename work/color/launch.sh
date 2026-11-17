#!/bin/bash
# 학습을 세션과 완전히 분리해서 띄운다.
#   사용법: bash work/color/launch.sh <모델명> [batch]
# setsid 로 새 세션을 만들어 부모(셸)가 죽어도 살아남게 하고,
# 표준입출력을 전부 파일/dev/null 로 돌려 호출한 쪽이 즉시 반환되게 한다.
set -u
cd /home/jovyan
MDL="$1"
BATCH="${2:-}"

export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8

if pgrep -f "train_one.py $MDL" >/dev/null; then
    echo "already-running"
    exit 0
fi

setsid python3 work/color/train_one.py "$MDL" $BATCH \
    >> "logs/${MDL}.log" 2>&1 < /dev/null &
setsid python3 work/color/watch_epochs.py "$MDL" \
    >> "logs/watch_${MDL}.log" 2>&1 < /dev/null &

sleep 5
echo "launched"
