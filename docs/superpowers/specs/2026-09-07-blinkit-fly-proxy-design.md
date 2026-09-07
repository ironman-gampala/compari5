# Blinkit Fly.io proxy

## Goal

Make Blinkit search work on Netlify by offloading Chrome-TLS (Impit) requests to a small Fly.io Node service.

## Why

Blinkit blocks normal serverless `fetch` (403). Impit native bindings do not load reliably in Netlify Functions. Local Mac Impit works; Fly Linux Impit works.

## Architecture

```
Browser → Netlify /api/search
            → blinkit.js
                 if BLINKIT_PROXY_URL set → Fly GET /search (Impit)
                 else → direct Impit (local)
            → instamart / zepto / bigbasket unchanged
```

## Fly service

- Path: `services/blinkit-proxy/`
- Endpoints: `GET /health`, `GET /search?q=&lat=&lng=`
- Auth: shared secret header `x-compari5-proxy-secret`
- Response: `{ products: [...] }` (Compari5 product shape)

## Netlify env

- `BLINKIT_PROXY_URL=https://<app>.fly.dev`
- `BLINKIT_PROXY_SECRET=<same secret as Fly>`

## Local

Unset proxy env → existing Impit path. Optional: set proxy URL to test prod path.
