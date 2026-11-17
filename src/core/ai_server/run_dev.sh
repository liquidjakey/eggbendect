#!/bin/bash
# backend/run_dev.sh와 동일한 방식으로 devenv(code-server) 내장 포트 프록시에 맞춰
# AI 모델 서버를 띄운다.
#
# 사용법:
#   cd src/core/ai_server
#   AI_SERVER_SOURCE=MONO  ./run_dev.sh 8001   # MONO 모델 인스턴스
#   AI_SERVER_SOURCE=COLOR ./run_dev.sh 8002   # COLOR 모델 인스턴스 (다른 터미널)

set -e
cd "$(dirname "$0")"

PORT="${1:-8001}"
export AI_SERVER_SOURCE="${AI_SERVER_SOURCE:-MONO}"
export AI_BACKEND_URL="${AI_BACKEND_URL:-http://127.0.0.1:8000}"

if [ -z "$VSCODE_PROXY_URI" ]; then
  echo "VSCODE_PROXY_URI 환경변수가 없습니다. 이 devenv(code-server) 밖에서 실행 중인가요?" >&2
  ROOT_PATH=""
else
  ROOT_PATH=$(python3 -c "
import os, re
uri = os.environ['VSCODE_PROXY_URI'].replace('{{port}}', '$PORT')
path = re.match(r'https?://[^/]+(/.*)', uri).group(1).rstrip('/')
print(path)
")
  echo "[$AI_SERVER_SOURCE] 접속 URL: ${VSCODE_PROXY_URI/\{\{port\}\}/$PORT}docs"
fi

export PATH="$HOME/.local/bin:$PATH"
if [ -n "$ROOT_PATH" ]; then
  exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --root-path "$ROOT_PATH" --reload
else
  exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
fi
