#!/usr/bin/env bash
# Keep Blinkit/Minutes home proxy + public tunnel alive, and register the URL
# on the live site (Netlify Blobs via /api/proxy-url) — no redeploy needed.
#
# Usage:
#   BLINKIT_PROXY_SECRET='…' ./start-home-tunnel.sh
# Optional:
#   COMPARI5_BASE_URL=https://compari5.netlify.app
#   PORT=8080
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET="${BLINKIT_PROXY_SECRET:-}"
PORT="${PORT:-8080}"
SITE="${COMPARI5_BASE_URL:-https://compari5.netlify.app}"
SITE="${SITE%/}"
LOG="${COMPARIS_TUNNEL_LOG:-/tmp/compari5-home-tunnel.log}"
URL_FILE="${COMPARIS_TUNNEL_URL_FILE:-/tmp/compari5-tunnel-url.txt}"

if [[ -z "$SECRET" ]]; then
  echo "Set BLINKIT_PROXY_SECRET (same value as Netlify env)." >&2
  exit 1
fi
if ! command -v ssh >/dev/null; then
  echo "ssh is required for localhost.run tunnels." >&2
  exit 1
fi

cd "$ROOT"
if [[ ! -d node_modules/impit ]]; then
  npm install
fi

PROXY_PID=""
SSH_PID=""
CURRENT_URL=""

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

cleanup() {
  [[ -n "${SSH_PID}" ]] && kill "$SSH_PID" 2>/dev/null || true
  [[ -n "${PROXY_PID}" ]] && kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT

ensure_proxy() {
  if curl -fsS -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    return 0
  fi
  lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  BLINKIT_PROXY_SECRET="$SECRET" PORT="$PORT" node server.js >>"$LOG" 2>&1 &
  PROXY_PID=$!
  sleep 1
  curl -fsS -m 5 "http://127.0.0.1:${PORT}/health" >/dev/null
  log "proxy up pid=$PROXY_PID"
}

register_url() {
  local url="$1"
  echo "$url" >"$URL_FILE"
  CURRENT_URL="$url"
  # Prefer live Blobs registration (instant). Env update is optional backup.
  if curl -fsS -m 20 -X PUT "${SITE}/api/proxy-url" \
    -H "content-type: application/json" \
    -H "x-compari5-proxy-secret: ${SECRET}" \
    -d "{\"url\":\"${url}\"}" >>"$LOG" 2>&1; then
    log "registered $url on $SITE"
  else
    log "WARN: failed to register $url on $SITE (is the new /api/proxy-url deployed?)"
  fi
}

start_tunnel() {
  [[ -n "${SSH_PID}" ]] && kill "$SSH_PID" 2>/dev/null || true
  rm -f /tmp/compari5-lhr.log
  ssh -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=20 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -R 80:127.0.0.1:"${PORT}" \
    nokey@localhost.run >'/tmp/compari5-lhr.log' 2>&1 &
  SSH_PID=$!
  local url=""
  for _ in $(seq 1 40); do
    url=$(grep -oE 'https://[a-z0-9]+\.lhr\.life' /tmp/compari5-lhr.log | head -1 || true)
    if [[ -n "$url" ]]; then
      break
    fi
    if ! kill -0 "$SSH_PID" 2>/dev/null; then
      log "ssh exited early"
      return 1
    fi
    sleep 1
  done
  if [[ -z "$url" ]]; then
    log "no tunnel URL from localhost.run"
    return 1
  fi
  # Wait until health works through the tunnel
  for _ in $(seq 1 20); do
    if curl -fsS -m 8 "$url/health" | grep -q '"ok":true'; then
      register_url "$url"
      return 0
    fi
    sleep 2
  done
  log "tunnel $url not healthy"
  return 1
}

tunnel_ok() {
  local url="${CURRENT_URL:-}"
  [[ -n "$url" ]] || url=$(cat "$URL_FILE" 2>/dev/null || true)
  [[ -n "$url" ]] || return 1
  curl -fsS -m 8 "$url/health" 2>/dev/null | grep -q '"ok":true'
}

log "watchdog starting (site=$SITE port=$PORT)"
ensure_proxy
start_tunnel || log "initial tunnel start failed — will retry"

while true; do
  ensure_proxy || true
  if ! tunnel_ok; then
    log "tunnel unhealthy — restarting"
    start_tunnel || true
  fi
  sleep 20
done
