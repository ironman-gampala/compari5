#!/usr/bin/env bash
# Start Blinkit/Minutes home proxy + public tunnel for Netlify.
# Keep this running while using https://compari5.netlify.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET="${BLINKIT_PROXY_SECRET:-}"
PORT="${PORT:-8080}"

if [[ -z "$SECRET" ]]; then
  echo "Set BLINKIT_PROXY_SECRET (same value as Netlify env)." >&2
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
echo
echo "Set Netlify BLINKIT_PROXY_URL to the public https URL printed below, then retry Compare."
echo "If Blinkit fails again, this tunnel died — re-run this script and update the URL."
echo

# Prefer localhost.run (SSH reverse tunnel). Cloudflare trycloudflare.com quick tunnels
# often return 530/"Tunnel not found" within minutes even while cloudflared still looks up.
if command -v ssh >/dev/null; then
  echo "Starting localhost.run tunnel…"
  exec ssh -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -R 80:127.0.0.1:"${PORT}" \
    nokey@localhost.run
fi

if command -v cloudflared >/dev/null; then
  echo "ssh missing; falling back to Cloudflare quick tunnel…"
  exec cloudflared tunnel \
    --url "http://127.0.0.1:${PORT}" \
    --protocol http2 \
    --edge-ip-version 4 \
    --ha-connections 4
fi

echo "Need ssh (localhost.run) or cloudflared." >&2
exit 1
