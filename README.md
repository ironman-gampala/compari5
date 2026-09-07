# Compari5

Personal India quick-commerce price compare for **Blinkit**, **Swiggy Instamart**, **Zepto**, and **BigBasket**.

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
- BigBasket usually works without login on both local and Netlify.
- If Instamart/Zepto stop returning prices, re-auth on the **live** site (no redeploy):
  - Swiggy: [https://compari5.netlify.app/api/auth/swiggy](https://compari5.netlify.app/api/auth/swiggy)
  - Zepto: [https://compari5.netlify.app/api/auth/zepto](https://compari5.netlify.app/api/auth/zepto)

---

## How to set up (local)

### Requirements

- Node.js **20+**
- npm

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

Connect Swiggy / Zepto once via OTP if guest Instamart fails (tokens land in `.data/`, gitignored).

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
| `BLINKIT_PROXY_URL` | `https://….onrender.com` |
| `BLINKIT_PROXY_SECRET` | same secret as Render `BLINKIT_PROXY_SECRET` |

3. `netlify.toml` already uses `@netlify/plugin-nextjs`.

4. After deploy, complete Swiggy/Zepto OTP on the **live** URLs above. Tokens are stored in **Netlify Blobs** and shared for all visitors.

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
  → JSON results (independent; one failure does not kill the rest)
```

### Blinkit

| | |
|--|--|
| **Path** | Direct Blinkit web APIs, or **Impit proxy** when `BLINKIT_PROXY_URL` is set |
| **Auth** | No user login. Fetches a guest `auth_key`, then search. |
| **HTTP** | Prefers **Impit** (Chrome-like TLS). Falls back to Undici if Impit is missing. |
| **Local** | Usually **works** (Impit native binary on your Mac) without the proxy. |
| **Netlify** | Needs `BLINKIT_PROXY_URL` + `BLINKIT_PROXY_SECRET` pointing at `services/blinkit-proxy` on **Render** (or similar). Direct Impit does not load in Netlify Functions. Cloud IPs may still get Blinkit 403. |

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
| **Path** | **Zepto MCP only** (no guest web scrape in the happy path) |
| **Auth** | Zepto MCP OAuth (phone OTP). Shared tokens on Netlify. |
| **MCP** | `https://mcp.zepto.co.in/mcp` |
| **Location** | `get_location_serviceability` → `select_store` → `search_products` |
| **Local / Netlify** | Same flow; tokens in `.data/` vs Netlify Blobs. |

Code: `lib/platforms/zepto.js`, `lib/auth/mcp.js`, `app/api/auth/zepto/*`

### BigBasket

| | |
|--|--|
| **Path** | Guest visit to bigbasket.com for cookies, then listing API |
| **Auth** | No user login |
| **Location** | Lat/lng + pin cookies; city/pin mapped to a warehouse `mid` |
| **Local / Netlify** | Usually **works** both places |

Code: `lib/platforms/bigbasket.js`

---

## Project layout

```
app/                  # Next.js UI + API routes
  api/search/         # Parallel platform search
  api/geocode/        # Google Places / Geocoding (+ Nominatim fallback)
  api/auth/           # Swiggy / Zepto OAuth start + callback
lib/
  platforms/          # blinkit, instamart, zepto, bigbasket adapters
  auth/               # MCP OAuth + token store (file / Netlify Blobs)
  http.js             # Impit + Undici fetch helper
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
| `npx netlify deploy --build --prod` | Deploy to Netlify |

---

## Security / privacy

- Do **not** commit `.env.local` or `.data/`.
- Live Instamart/Zepto sessions are **shared** for everyone who uses your Netlify URL.
- Treat the live link as a personal play tool, not a public product.

---

## Disclaimer

Unofficial. Not affiliated with Blinkit, Swiggy, Zepto, or BigBasket. Store APIs and MCPs can break or block without notice.
