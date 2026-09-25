# Design: Blinkit / Minutes without work-laptop tunnels

Date: 2026-09-25

## Problem

Home reverse tunnels (`localhost.run` / cloudflared) from a corporate Mac are a security-team risk. Cloud datacenter IPs are blocked by Blinkit.

## Decision

1. **Stop** home tunnels on the work Mac.
2. Live Netlify site: Instamart / Zepto / BigBasket as today.
3. Blinkit + Minutes on Netlify only when **`RESIDENTIAL_PROXY_URL`** is set (vendor residential HTTP proxy).
4. Without that env, those columns show a clear local-only / configure-proxy message (no 503 tunnel noise).
5. Local `npm run dev` keeps using Impit directly (no tunnel).
6. Optional `ENABLE_HOME_PROXY=1` remains for a personal home box only — off by default.

## Residential proxy

Impit `proxyUrl` + Undici `ProxyAgent` read `RESIDENTIAL_PROXY_URL` (or `HTTPS_PROXY` / `HTTP_PROXY`).

Format: `http://USERNAME:PASSWORD@HOST:PORT`

Providers (examples): Bright Data, Oxylabs, IPRoyal, Smartproxy — user supplies credentials; Compari5 does not embed keys.
