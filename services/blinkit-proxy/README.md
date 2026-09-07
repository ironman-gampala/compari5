# Compari5 Blinkit proxy

Small Node service that calls Blinkit with **Impit** (Chrome TLS). Netlify cannot do this inside Functions.

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — header `x-compari5-proxy-secret: <secret>`

## Recommended: Railway (no card for trial)

Railway: **$5 trial / 30 days**, then **~$1/month** free credit (enough for a tiny sleeping/light service). No card required to start.

1. Sign up at [railway.com](https://railway.com) with GitHub (`ironman-gampala`).
2. **New Project** → **Deploy from GitHub** → repo `compari5`.
3. Set **Root Directory** to `services/blinkit-proxy`.
4. Add variable: `BLINKIT_PROXY_SECRET` = a long random string.
5. Generate a public domain (Settings → Networking → Generate domain).
6. Copy URL, e.g. `https://compari5-blinkit-proxy-production.up.railway.app`.

### Netlify

- `BLINKIT_PROXY_URL` = that Railway URL (no trailing slash)
- `BLINKIT_PROXY_SECRET` = same secret  
Then redeploy Compari5.

## Fly.io (optional / paid)

Fly asks for a card for ongoing use. Prefer Railway unless you already pay for Fly.

```bash
cd services/blinkit-proxy
fly auth login
fly apps create compari5-blinkit-proxy
fly secrets set BLINKIT_PROXY_SECRET='…'
fly deploy
```
