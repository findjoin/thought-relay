#!/usr/bin/env bash
set -euo pipefail
RELAY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$RELAY_ROOT"
RELAY_NODE="${RELAY_NODE:-$(command -v node || true)}"
if [[ -z "$RELAY_NODE" || ! -x "$RELAY_NODE" ]] || ! "$RELAY_NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo '请先安装 Node.js 24+ 并加入 PATH，或通过 RELAY_NODE 指定 node 可执行文件。' >&2
  exit 1
fi
export PATH="$(dirname "$RELAY_NODE"):$PATH"
if [[ ! -f apps/inno-agent/dist/server.js || ! -f apps/inno-agent/web/dist/index.html ]]; then
  echo '首次启动前请安装依赖并执行 npm run build。' >&2
  exit 1
fi
mkdir -p runtime/config workspace
if [[ ! -f runtime/config/config.json ]]; then
  cp config.example.json runtime/config/config.json
  chmod 600 runtime/config/config.json
fi
exec "$RELAY_NODE" apps/inno-agent/dist/server.js --home "$RELAY_ROOT/runtime" --workspace "$RELAY_ROOT/workspace" --port "${RELAY_PORT:-8049}"
