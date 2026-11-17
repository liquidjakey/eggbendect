#!/bin/bash
# devenv(code-server) 내장 포트 프록시에 맞춰 backend를 띄우는 스크립트.
#
# 이 devenv 안에서 uvicorn을 직접 띄우면 model/ci 파이프라인이나 ArgoCD 없이도
# 브라우저에서 VSCODE_PROXY_URI 경로로 바로 접속해 백엔드를 쓸 수 있다.
# FastAPI가 프록시 prefix를 알아야 /docs, /openapi.json 등 절대경로가 깨지지 않으므로
# --root-path 로 그 prefix를 넘겨준다.
#
# 사용법: cd src/core/backend && ./run_dev.sh [port]

set -e
cd "$(dirname "$0")"

PORT="${1:-8000}"

if [ -z "$VSCODE_PROXY_URI" ]; then
  echo "VSCODE_PROXY_URI 환경변수가 없습니다. 이 devenv(code-server) 밖에서 실행 중인가요?" >&2
  echo "그냥 uvicorn app.main:app --host 0.0.0.0 --port $PORT 로 실행합니다 (root-path 없이)." >&2
  ROOT_PATH=""
else
  ROOT_PATH=$(python3 -c "
import os, re
uri = os.environ['VSCODE_PROXY_URI'].replace('{{port}}', '$PORT')
path = re.match(r'https?://[^/]+(/.*)', uri).group(1).rstrip('/')
print(path)
")
  echo "접속 URL: ${VSCODE_PROXY_URI/\{\{port\}\}/$PORT}docs"
fi

export PATH="$HOME/.local/bin:$PATH"
if [ -n "$ROOT_PATH" ]; then
  exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --root-path "$ROOT_PATH" --reload
else
  exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
fi
