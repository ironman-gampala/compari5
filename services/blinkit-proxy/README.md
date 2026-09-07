# Compari5 Blinkit proxy

Small Node service that calls Blinkit with **Impit** (Chrome TLS). Netlify cannot do this inside Functions.

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — header `x-compari5-proxy-secret: <secret>`

## Recommended: Render (free web service)

Render free web services sleep after ~15 minutes idle (first hit after idle can take ~1 minute).

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New** → **Web Service** → repo `ironman-gampala/compari5`.
3. **Root Directory:** `services/blinkit-proxy`
4. **Runtime:** Docker · **Instance:** Free
5. Env: `BLINKIT_PROXY_SECRET` = long random string (`openssl rand -hex 32`); set `PORT=8080` if needed.
6. Deploy. Public URL looks like `https://compari5.onrender.com`.

Smoke-test: open `https://YOUR-URL/health`.

**Note:** Blinkit may still return **403** from cloud/datacenter IPs even with Impit. Local Mac often works; residential IP or a home-hosted proxy may be required for reliable cloud Blinkit.

### Netlify

- `BLINKIT_PROXY_URL` = that Render URL (no trailing slash)
- `BLINKIT_PROXY_SECRET` = same secret  
Then redeploy Compari5.

## Alternatives

- **Railway** — trial credit, not forever free.
- **Koyeb** — free tier closed for new signups (Mistral acquisition; paid only).
- **Fly.io** — card for ongoing use.

```bash
# Fly (optional)
cd services/blinkit-proxy
fly auth login
fly apps create compari5-blinkit-proxy
fly secrets set BLINKIT_PROXY_SECRET='…'
fly deploy
```
