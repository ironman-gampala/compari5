# Compari5 Blinkit proxy

Small Node service that calls Blinkit / Flipkart Minutes with **Impit** (Chrome TLS). Netlify Functions cannot do Impit, so the live site must call this proxy on your home IP.

## Why Netlify fails without a home tunnel

| Where | Result |
|--|--|
| Your Mac (local Compari5) | Works |
| Netlify / Render / other cloud IPs | Blinkit often **403** |

## Self-healing setup (recommended)

Free tunnels (`localhost.run`) die often. The watchdog restarts them and **registers the new URL on the live site** (`PUT /api/proxy-url` → Netlify Blobs), so you usually **do not need a redeploy**.

```bash
cd services/blinkit-proxy
BLINKIT_PROXY_SECRET='your-long-secret' ./start-home-tunnel.sh
```

Or from repo root:

```bash
BLINKIT_PROXY_SECRET='your-long-secret' npm run proxy:tunnel
```

**Leave that process running** (terminal, `tmux`, or `launchd`). It will:

1. Start `server.js` on `:8080`
2. Open a localhost.run tunnel
3. Register `https://….lhr.life` via `PUT https://compari5.netlify.app/api/proxy-url`
4. Re-check health every ~20s and restart if the tunnel dies

### Netlify env

| Key | Value |
|--|--|
| `BLINKIT_PROXY_SECRET` | same secret as local (**required**) |
| `BLINKIT_PROXY_URL` | optional fallback if Blobs is empty |
| `COMPARI5_BASE_URL` | `https://compari5.netlify.app` |

### Verify

```bash
curl -s 'https://compari5.netlify.app/api/search?q=milk&lat=12.9352&lng=77.6245&platform=blinkit'
```

Blinkit `products` should be non-empty.

## Proxy-only (no tunnel)

```bash
cd services/blinkit-proxy
npm install
BLINKIT_PROXY_SECRET='your-long-secret' npm start
```

```bash
curl -s 'http://127.0.0.1:8080/health'
curl -s 'http://127.0.0.1:8080/search?q=milk&lat=12.9352&lng=77.6245' \
  -H "x-compari5-proxy-secret: your-long-secret"
```

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — Blinkit; header `x-compari5-proxy-secret`
- `GET /minutes?q=&lat=&lng=&postalCode=&…` — Flipkart Minutes; same secret

Live site:

- `PUT /api/proxy-url` `{ "url": "https://….lhr.life" }` with `x-compari5-proxy-secret`
- `GET /api/proxy-url` (same secret) — see registered URL
