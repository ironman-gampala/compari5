# Compari5 Blinkit proxy

Small Node service that calls Blinkit with **Impit** (Chrome TLS). Netlify Functions cannot do Impit, so the live site must call this proxy.

## Why Netlify fails today

| Where | Result |
|--|--|
| Your Mac (local Compari5) | Works |
| Render proxy (`compari5.onrender.com`) | Health OK, Blinkit **403** (datacenter IP blocked) |
| Netlify → Render → Blinkit | Same **403** |

Impit alone is not enough in the cloud. Blinkit also blocks many **server/datacenter IPs**. Your home IP is allowed; Render’s is not.

## Fix that works: home proxy + tunnel

Run this proxy on the machine where Blinkit already works (your Mac), expose it with a tunnel, point Netlify at that URL.

### 1. Start the proxy locally

```bash
cd services/blinkit-proxy
npm install
BLINKIT_PROXY_SECRET='your-long-secret' npm start
```

Smoke-test:

```bash
curl -s 'http://127.0.0.1:8080/health'
curl -s 'http://127.0.0.1:8080/search?q=milk&lat=12.9352&lng=77.6245' \
  -H "x-compari5-proxy-secret: your-long-secret"
```

You should see products JSON (not 403).

### 2. Expose it (Cloudflare quick tunnel)

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/), then:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

Copy the `https://….trycloudflare.com` URL it prints.

(Named Cloudflare Tunnel / Tailscale Funnel also work if you want a stable hostname.)

### 3. Point Netlify at your home proxy

Netlify → Site settings → Environment variables:

| Key | Value |
|--|--|
| `BLINKIT_PROXY_URL` | `https://….trycloudflare.com` (no trailing slash) |
| `BLINKIT_PROXY_SECRET` | same secret as local |

Redeploy the site (or trigger a clear-cache deploy). Keep the Mac proxy + tunnel running while you use Compari5 on Netlify.

### 4. Verify

```bash
curl -s 'https://compari5.netlify.app/api/search?q=milk&lat=12.9352&lng=77.6245&platform=blinkit'
```

Blinkit `products` should be non-empty.

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — header `x-compari5-proxy-secret: <secret>`

## Render (optional / backup)

Render free tier is fine for `/health`, but Blinkit often still **403**s from Render IPs. Prefer the home tunnel for real prices.

If you still use Render:

1. Root Directory: `services/blinkit-proxy`
2. Runtime: Docker
3. Env: `BLINKIT_PROXY_SECRET`

## Paid alternative

A residential-IP proxy provider in front of Blinkit (or hosting this service on a residential exit) can work 24/7 without your Mac. Free cloud VMs usually will not.
