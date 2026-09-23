# Compari5

Personal India quick-commerce price compare for **Blinkit**, **Swiggy Instamart**, **Zepto**, **BigBasket**, and **Flipkart Minutes**.

Live site: [https://compari5.netlify.app](https://compari5.netlify.app)

No checkout. Unofficial personal / play tool — not affiliated with any of the stores.

---

## How to use

1. Open the site (local or Netlify).
2. Enter a **delivery area** → **Find area** → pick a suggestion.
3. Search a product (or tap a staple) → **Compare prices**.
4. Browse results per store → **Add** items to the basket → compare totals.
5. **Open** jumps to that product on the store’s website.

**Notes**

- Instamart and Zepto use **shared server tokens** (one OTP login on the server for everyone visiting the live site).
- Blinkit often works only on your laptop (see integrations below).
- BigBasket prefers **bbnow.bigbasket.com** (www listing is often Akamai-blocked).
- Flipkart Minutes sets HYPERLOCAL location via `serviceability` → `location/update`, then searches. On Netlify it uses the **same home Impit tunnel** as Blinkit.
- Blinkit on Netlify needs the **home Impit proxy + Cloudflare tunnel** (`services/blinkit-proxy/start-home-tunnel.sh`). Render cloud IPs are 403’d.
- If Instamart/Zepto stop returning prices:
  - Swiggy: [https://compari5.netlify.app/api/auth/swiggy](https://compari5.netlify.app/api/auth/swiggy)
  - Zepto: OTP must run on **localhost** (Zepto rejects Netlify redirect URIs). Then sync tokens:
    ```bash
    npm run dev   # http://localhost:3000/api/auth/zepto → finish OTP
    npm run sync:zepto-auth
    ```

---

## How to set up (local)

### Requirements

- Node.js **20+**
- npm
- Google Chrome (optional; enables Zepto guest search when MCP is unsigned)

No Python venv. Dependencies live in `node_modules` (gitignored).

### Steps

```bash
git clone https://github.com/ironman-gampala/compari5.git
cd compari5
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# Required for good area search (optional: falls back to OpenStreetMap)
GOOGLE_MAPS_API_KEY=your_key_here

# For local OAuth redirects while testing Swiggy/Zepto login
COMPARI5_BASE_URL=http://localhost:3000
```

For Google Maps:

1. Enable **Places API (New)** and **Geocoding API** in [Google Cloud Console](https://console.cloud.google.com/apis/library).
2. Create an API key and put it in `.env.local` (never commit `.env.local`).

Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Connect Swiggy / Zepto once via OTP if guest search fails (tokens land in `.data/`, gitignored).

---

## How to set up (Netlify)

1. Connect this GitHub repo to Netlify **or** keep deploying with CLI:

   ```bash
   npx netlify login
   npx netlify link
   npx netlify deploy --build --prod
   ```

2. Site env vars (Builds + Functions + Runtime):

   | Variable | Example |
   |----------|---------|
| `COMPARI5_BASE_URL` | `https://compari5.netlify.app` |
| `GOOGLE_MAPS_API_KEY` | your key |
| `BLINKIT_PROXY_URL` | `https://….trycloudflare.com` (home tunnel) |
| `BLINKIT_PROXY_SECRET` | same secret as the home proxy |

3. `netlify.toml` already uses `@netlify/plugin-nextjs`.

4. After deploy:
   - Swiggy OTP on the live `/api/auth/swiggy` URL (tokens → Netlify Blobs).
   - Zepto OTP on **localhost**, then `npm run sync:zepto-auth` to push `.data/` into Netlify Blobs.

---

## How each quick-commerce app is integrated

High-level flow:

```
Browser UI
  → GET /api/geocode?q=…     (area → lat/lng)
  → GET /api/search?q=&lat=&lng=&…
       → Blinkit adapter
       → Instamart adapter
       → Zepto adapter
       → BigBasket adapter
       → Minutes adapter
  → JSON results (independent; one failure does not kill the rest)
```

### Blinkit

| | |
|--|--|
| **Path** | Direct Blinkit web APIs, or **Impit proxy** when `BLINKIT_PROXY_URL` is set |
| **Auth** | No user login. Fetches a guest `auth_key`, then search. |
| **HTTP** | Prefers **Impit** (Chrome-like TLS). Falls back to Undici if Impit is missing. |
| **Local** | Usually **works** (Impit native binary on your Mac) without the proxy. |
| **Netlify** | Must call `BLINKIT_PROXY_URL`. **Render cloud IPs are 403’d** — run `./start-home-tunnel.sh` in `services/blinkit-proxy`, set Netlify `BLINKIT_PROXY_URL` to the `trycloudflare.com` URL, redeploy. Keep Mac proxy+tunnel running. |

Proxy code: `services/blinkit-proxy/` (see its README).

### Swiggy Instamart

| | |
|--|--|
| **Path** | 1) Guest Instamart search attempt → 2) if empty/blocked, **Swiggy MCP** |
| **Auth** | Swiggy MCP OAuth (phone OTP). Tokens shared site-wide on Netlify. |
| **MCP** | `https://mcp.swiggy.com/im` via `@modelcontextprotocol/sdk` |
| **Location** | Creates/reuses a temporary address tagged like `Compari5 · …` for the pin. |
| **Local** | Guest often blocked; OTP + `.data/` tokens common. |
| **Netlify** | Guest sometimes works from cloud IPs; otherwise shared Blobs tokens. |

**Note:** Swiggy positions MCP as for builders / agents, not a formal production web API. It can work technically while remaining unsupported / changeable.

Code: `lib/platforms/instamart.js`, `lib/auth/mcp.js`, `app/api/auth/swiggy/*`

### Zepto

| | |
|--|--|
| **Path** | Prefer **Zepto MCP**; if unsigned / MCP fails, **Chrome guest search** (local only) |
| **Auth** | Zepto MCP OAuth (phone OTP). Shared tokens on Netlify via Blobs sync. |
| **MCP** | `https://mcp.zepto.co.in/mcp` |
| **OAuth caveat** | Zepto only whitelists **localhost** redirect URIs (`domain_not_whitelisted` on Netlify). OTP at `http://localhost:3000/api/auth/zepto`, then `npm run sync:zepto-auth`. |
| **Location** | `get_location_serviceability` → `select_store` → `search_products` |
| **Local** | MCP and/or headless Chrome guest scrape (`puppeteer-core`). |
| **Netlify** | MCP tokens from Blobs only (no Chrome on Functions). |

Code: `lib/platforms/zepto.js`, `lib/browser.js`, `lib/auth/mcp.js`, `app/api/auth/zepto/*`, `scripts/sync-zepto-auth.mjs`

### BigBasket

| | |
|--|--|
| **Path** | Guest cookies, then `listing-svc/v2/products` |
| **Auth** | No user login |
| **Host** | Tries **bbnow.bigbasket.com** first, then www (www is often Akamai 403) |
| **Location** | Lat/lng + pin cookies; city/pin mapped to a warehouse `mid` |
| **Local / Netlify** | Usually works when bbnow is reachable |

Code: `lib/platforms/bigbasket.js`

### Flipkart Minutes

| | |
|--|--|
| **Path** | Flipkart rome APIs with `marketplace=HYPERLOCAL` |
| **Auth** | Guest cookies from flipkart.com |
| **Location** | `serviceability` → `location/update` (address Confirm equivalent) → `page/fetch` search |
| **Local** | Direct Impit to Flipkart rome APIs |
| **Netlify** | Uses the same home Impit proxy as Blinkit (`BLINKIT_PROXY_URL` → `GET /minutes`) |

Code: `lib/platforms/minutes.js`  
Spec: `docs/superpowers/specs/2026-09-23-flipkart-minutes-design.md`

---

## Project layout

```
app/                  # Next.js UI + API routes
  api/search/         # Parallel platform search
  api/geocode/        # Google Places / Geocoding (+ Nominatim fallback)
  api/auth/           # Swiggy / Zepto OAuth start + callback
lib/
  platforms/          # blinkit, instamart, zepto, bigbasket, minutes adapters
  auth/               # MCP OAuth + token store (file / Netlify Blobs)
  browser.js          # Shared Chrome helper (Zepto guest)
  http.js             # Impit + Undici fetch helper
scripts/
  sync-zepto-auth.mjs # Push local Zepto tokens to Netlify Blobs
services/blinkit-proxy/
  start-home-tunnel.sh
public/logos/         # Store icons
netlify.toml          # Next.js on Netlify + COMPARI5_BASE_URL
```

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` | Production build |
| `npm start` | Run production build locally |
| `npm run sync:zepto-auth` | Push local Zepto OTP tokens to Netlify Blobs |
| `npx netlify deploy --build --prod` | Deploy to Netlify |

---

## Security / privacy

- Do **not** commit `.env.local` or `.data/`.
- Live Instamart/Zepto sessions are **shared** for everyone who uses your Netlify URL.
- Treat the live link as a personal play tool, not a public product.

---

## Disclaimer

Unofficial. Not affiliated with Blinkit, Swiggy, Zepto, BigBasket, or Flipkart. Store APIs and MCPs can break or block without notice.
