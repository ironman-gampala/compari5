# Compari5 Blinkit proxy (personal / optional)

Small Node Impit service for Blinkit + Flipkart Minutes.

**Do not run this tunnel from a work laptop.** Corporate security tools often flag reverse tunnels (`localhost.run`, cloudflared). Prefer:

1. `npm run dev` locally (no tunnel), or
2. `RESIDENTIAL_PROXY_URL` on Netlify (residential HTTP proxy)

## When to use this folder

Only on a **personal** machine (home Pi / personal Mac) with:

```bash
ENABLE_HOME_PROXY=1
BLINKIT_PROXY_SECRET='…'
./start-home-tunnel.sh
```

Netlify must also have `ENABLE_HOME_PROXY=1` for the live site to call this proxy.

## Endpoints

- `GET /health`
- `GET /search?q=&lat=&lng=`
- `GET /minutes?q=&lat=&lng=&postalCode=&…`
