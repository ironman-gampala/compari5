# Compari5 Blinkit proxy (Fly.io)

Small Node service that calls Blinkit with **Impit** (Chrome TLS). Netlify cannot do this reliably.

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — requires header `x-compari5-proxy-secret: <secret>`

## Deploy

```bash
# install Fly CLI once: https://fly.io/docs/hands-on/install-flyctl/
cd services/blinkit-proxy
fly auth login
fly apps create compari5-blinkit-proxy   # skip if name taken; edit fly.toml
fly secrets set BLINKIT_PROXY_SECRET='choose-a-long-random-string'
fly deploy
```

Copy the app URL (e.g. `https://compari5-blinkit-proxy.fly.dev`).

## Netlify

Set:

- `BLINKIT_PROXY_URL=https://compari5-blinkit-proxy.fly.dev`
- `BLINKIT_PROXY_SECRET=<same secret>`

Redeploy Compari5.
