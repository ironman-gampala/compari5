# Blinkit Impit proxy

## Goal

Make Blinkit search work on Netlify by offloading Chrome-TLS (Impit) requests to a small Node proxy.

**Host:** Render free web service (`https://compari5.onrender.com`). Note: Blinkit may still 403 datacenter IPs; Impit alone is not always enough.

## Why

Blinkit blocks normal serverless `fetch` (403). Impit native bindings do not load reliably in Netlify Functions. Local Mac Impit usually works.

## Architecture

```
Browser → Netlify /api/search
            → blinkit.js
                 if BLINKIT_PROXY_URL set → proxy GET /search (Impit)
                 else → direct Impit (local)
            → instamart / zepto / bigbasket unchanged
```

## Proxy service

- Path: `services/blinkit-proxy/` (Dockerfile + Node)
- Endpoints: `GET /health`, `GET /search?q=&lat=&lng=`
- Auth: shared secret header `x-compari5-proxy-secret`
- Response: `{ products: [...] }` (Compari5 product shape)

## Netlify env

- `BLINKIT_PROXY_URL=https://compari5.onrender.com`
- `BLINKIT_PROXY_SECRET=<same secret as Render>`

## Local

Unset proxy env → existing Impit path. Optional: set proxy URL to test prod path.
