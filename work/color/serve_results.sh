#!/bin/bash
# results/ 를 브라우저로 내려받을 수 있게 임시 파일서버를 띄운다.
#   사용법: bash work/color/serve_results.sh [포트]
#   끄기:   bash work/color/serve_results.sh stop
#
# jupyter-server-proxy 가 깔려 있어 JupyterHub 주소 뒤에 /proxy/<포트>/ 를 붙이면
# 이 서버에 닿는다. JupyterHub 로그인 세션이 있어야 접근되므로 외부에 열리지 않는다.
set -u
PORT="${1:-8899}"
cd /home/jovyan

if [ "$PORT" = "stop" ]; then
    pkill -f "http.server" && echo "stopped" || echo "not-running"
    exit 0
fi

pkill -f "http.server" 2>/dev/null
sleep 1
setsid python3 -m http.server "$PORT" --directory /home/jovyan/results \
    > logs/fileserver.log 2>&1 < /dev/null &
sleep 2

if pgrep -f "http.server $PORT" >/dev/null; then
    echo "serving on port $PORT"
    echo "URL: ${JUPYTERHUB_SERVICE_PREFIX}proxy/${PORT}/"
else
    echo "failed"
fi
