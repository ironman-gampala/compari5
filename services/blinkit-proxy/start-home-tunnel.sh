#!/usr/bin/env bash
# Start Blinkit home proxy + Cloudflare quick tunnel for Netlify.
# Keep this running while using https://compari5.netlify.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET="${BLINKIT_PROXY_SECRET:-}"
PORT="${PORT:-8080}"

if [[ -z "$SECRET" ]]; then
  echo "Set BLINKIT_PROXY_SECRET (same value as Netlify env)." >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared missing. Install: brew install cloudflare/cloudflare/cloudflared" >&2
  exit 1
fi

cd "$ROOT"
if [[ ! -d node_modules/impit ]]; then
  npm install
fi

lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
BLINKIT_PROXY_SECRET="$SECRET" PORT="$PORT" node server.js &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT

sleep 1
curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null

echo "Proxy on :${PORT} (pid $PROXY_PID)"
echo "Starting Cloudflare quick tunnel…"
echo "After you see the https://….trycloudflare.com URL, set Netlify BLINKIT_PROXY_URL to it and redeploy if needed."
echo

cloudflared tunnel --url "http://127.0.0.1:${PORT}"
