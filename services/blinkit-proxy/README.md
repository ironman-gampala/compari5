# Compari5 Blinkit proxy

Small Node service that calls Blinkit with **Impit** (Chrome TLS). Netlify cannot do this inside Functions.

Deployed on **Render**: https://compari5.onrender.com

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=` — header `x-compari5-proxy-secret: <secret>`

## Deploy (Render)

1. [render.com](https://render.com) → **New** → **Web Service** → repo `ironman-gampala/compari5`
2. **Root Directory:** `services/blinkit-proxy`
3. **Runtime:** Docker · **Instance:** Free
4. Env: `BLINKIT_PROXY_SECRET` (and `PORT=8080` if needed)
5. Deploy → smoke-test `/health`

Free instances sleep after ~15 minutes idle.

**Note:** Blinkit may still return **403** from cloud/datacenter IPs even with Impit. Local Mac often works; a residential IP may be required for reliable cloud Blinkit.

## Netlify

- `BLINKIT_PROXY_URL` = Render URL (no trailing slash), e.g. `https://compari5.onrender.com`
- `BLINKIT_PROXY_SECRET` = same secret as Render  
Then redeploy Compari5.
