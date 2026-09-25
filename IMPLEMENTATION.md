# Compari5 — Implementation

How each quick-commerce store and Google Maps are integrated. Code paths are the source of truth; this doc is the map.

---

## End-to-end flow

```
Browser (app/page.js)
  │
  ├─ type address  → GET /api/geocode?q=…&mode=suggest
  │                  pick suggestion → GET /api/geocode?placeId=… (or q=…)
  │                  → lat, lng, label, city, postalCode (pin enriched)
  │
  └─ Compare       → GET /api/search?q=&lat=&lng=&label=&city=&postalCode=&…
                       → lib/platforms/searchAll()  (Promise.all, isolated errors)
                            ├─ blinkit
                            ├─ instamart
                            ├─ zepto
                            ├─ bigbasket
                            └─ minutes
                       → JSON { results: { platform: { products, error, meta } } }
```

UI then filters client-side (`lib/relevance.js` — category / false-friends), sorts, and renders one column per store.

---

## Google Maps (delivery area)

**Files:** `app/api/geocode/route.js`, `lib/postal.js`

### Why

Every store needs a **lat/lng** (and ideally a **6-digit PIN**) for warehouse / serviceability. Users type neighbourhood names, not coordinates.

### What we call

| Step | API | Purpose |
|------|-----|---------|
| Suggest | Places API (New) `places:autocomplete` | Dropdown while typing (`includedRegionCodes: ["in"]`) |
| Resolve | Places API (New) `places/{placeId}` | `formattedAddress`, `location`, `addressComponents` |
| Fallback search | Places Text / legacy Geocoding | If autocomplete path fails |
| Offline fallback | OpenStreetMap Nominatim | When `GOOGLE_MAPS_API_KEY` is missing or Google errors |

Env: `GOOGLE_MAPS_API_KEY` (never commit). Enable **Places API (New)** + **Geocoding API** in Google Cloud.

### PIN enrichment

Google Places often **omits `postal_code`** for localities (e.g. “Koramangala”). Flipkart Minutes and BigBasket need a pin.

`lib/postal.js` → `resolveIndianPin` / `withPostalCode`:

1. Use pin already on the place / label if present.
2. Else Google Geocoding reverse (`latlng` + prefer `result_type=postal_code`).
3. Else Nominatim reverse.

Search route runs the same enrichment again before calling platforms (`app/api/search/route.js`).

### UI contract

- Suggestions: `/api/geocode?q=…` → list with `placeId`.
- On pick: resolve place → show **location chip** (“Near …”).
- Chip present ⇒ Compare is allowed.

---

## Shared search orchestration

**File:** `lib/platforms/index.js`

`searchAll(query, lat, lng, options)` runs adapters in parallel. One throw becomes `{ products: [], error }` for that platform only — other columns keep working.

Normalized product shape (all adapters):

```js
{
  id, name, brand, quantity, mrp, price, image, eta, url, platform
}
```

HTTP helper: `lib/http.js` — prefers **Impit** (Chrome-like TLS), falls back to **Undici**.

---

## Blinkit

**Files:** `lib/platforms/blinkit.js`, `services/blinkit-proxy/`

### Approach

1. Guest `auth_key` from Blinkit web (`/v2/accounts/auth_key/`).
2. Search with lat/lng headers + `auth_key`.
3. Map response cards → product list (cap ~24).

### Local vs Netlify

| Environment | Path |
|-------------|------|
| Mac / local | Direct Impit to Blinkit — usually works |
| Netlify | Set **`RESIDENTIAL_PROXY_URL`** (residential HTTP proxy). Without it, column shows “not available on cloud”. |

Blinkit blocks datacenter IPs. Prefer a paid residential proxy on Netlify — **not** a reverse tunnel from a work laptop. Optional personal-home tunnel remains behind `ENABLE_HOME_PROXY=1` only.

---

## Swiggy Instamart

**Files:** `lib/platforms/instamart.js`, `lib/auth/mcp.js`, `app/api/auth/swiggy/*`

### Approach (two tiers)

1. **Guest web search** — scrape/call Instamart search JSON when cloud IP allows.
2. If empty / blocked → **Swiggy MCP** at `https://mcp.swiggy.com/im` via `@modelcontextprotocol/sdk`.

### Auth

- Phone OTP OAuth through `/api/auth/swiggy`.
- Tokens stored server-side (`.data/` locally, **Netlify Blobs** on deploy) — **one shared session** for all visitors of the live URL.

### Location

MCP path creates or reuses a temporary delivery address tagged like `Compari5 · …` near the user’s lat/lng (`meta.addressCreated` / `addressLabel` surfaced in the UI).

### Note

Swiggy positions MCP for builders/agents; it can change or rate-limit without notice.

---

## Zepto

**Files:** `lib/platforms/zepto.js`, `lib/browser.js`, `lib/auth/mcp.js`, `app/api/auth/zepto/*`, `scripts/sync-zepto-auth.mjs`

### Approach

Prefer **Zepto MCP** (`https://mcp.zepto.co.in/mcp`):

1. `get_location_serviceability` (lat/lng)
2. `select_store` (store id)
3. `search_products`

If MCP is unsigned / fails **and** Chrome is available locally → **guest search** via `puppeteer-core` (`lib/browser.js`). Netlify Functions have no Chrome, so production needs MCP tokens.

### Auth caveat (important)

Zepto OAuth only whitelists **localhost** redirect URIs (`domain_not_whitelisted` on Netlify).

```bash
# on your laptop
npm run dev
# open http://localhost:3000/api/auth/zepto → finish OTP
npm run sync:zepto-auth   # pushes .data/ tokens into Netlify Blobs
```

Prices are in **paise** in some payloads; adapter converts to rupees.

---

## BigBasket (bbnow)

**File:** `lib/platforms/bigbasket.js`

### Approach

1. Hit `bbnow.bigbasket.com` (preferred) or `www.bigbasket.com` for guest cookies.
2. Call `listing-svc/v2/products` with lat/lng + pin cookies.
3. Map `tabs[0].product_info.products` → normalized list.

### Why bbnow first

`www.bigbasket.com` listing is often **Akamai 403**. `bbnow.bigbasket.com` still serves the same listing API.

### Warehouse `mid`

Heuristic from pin / city (`560*` → Bengaluru `100`, Mumbai `3`, etc.) when the API needs a market id.

No user login.

---

## Flipkart Minutes

**Files:** `lib/platforms/minutes.js`, `services/blinkit-proxy/minutes-search.js`  
**Spec:** `docs/superpowers/specs/2026-09-23-flipkart-minutes-design.md`

### Approach (Flipkart rome + HYPERLOCAL)

1. Collect guest cookies from `flipkart.com`.
2. **`/api/1/location/serviceability`** — is Minutes available here?
3. **`/api/4/location/update`** — commit pin / address (same idea as Confirm address in the app).
4. **`/api/4/page/fetch`** with `marketplace=HYPERLOCAL` — search results page JSON → products.

Needs a real **6-digit postal code**. If pin enrichment fails, UI shows: *“Flipkart Minutes still needs a delivery pin…”*.

### Local vs Netlify

| Environment | Path |
|-------------|------|
| Local | Direct Impit to `*.rome.api.flipkart.com` |
| Netlify | Same as Blinkit: **`RESIDENTIAL_PROXY_URL`**, or clear unavailable message |

Impit through a residential IP works better than bare Netlify egress.

---

## Client-side after search

| Piece | Role |
|-------|------|
| `lib/relevance.js` | Drop false-friends (butter ≠ buttermilk); category chip |
| Filters bar | Sort, brand multi-select, max ₹, on offer / in stock |
| Match board | Group same name + pack size across columns |
| Basket | Per-store columns + named saved baskets (localStorage) |

---

## Env cheat sheet

| Variable | Used by |
|----------|---------|
| `GOOGLE_MAPS_API_KEY` | Geocode / Places / reverse pin |
| `COMPARI5_BASE_URL` | OAuth redirect base |
| `RESIDENTIAL_PROXY_URL` | Blinkit + Minutes egress on Netlify (residential HTTP proxy) |
| `ENABLE_HOME_PROXY` | Opt-in personal home tunnel only (`1` / `true`) |
| `BLINKIT_PROXY_URL` / `SECRET` | Only with `ENABLE_HOME_PROXY` |
| `USE_NETLIFY_BLOBS` | Force Blobs token store locally |

---

## Failure modes (quick triage)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Blinkit / Minutes “not available on live cloud” | No residential proxy on Netlify | Set `RESIDENTIAL_PROXY_URL`, or use `npm run dev` |
| Blinkit 403 | Datacenter IP | Residential proxy or local Impit |
| Instamart empty | Guest blocked + no MCP token | OTP at `/api/auth/swiggy` |
| Zepto empty on Netlify | No synced tokens | Local OTP + `npm run sync:zepto-auth` |
| BigBasket empty | Akamai / host | Confirm bbnow path; retry |

---

## Disclaimer

Unofficial reverse-engineered / MCP integrations. Endpoints, bots, and OAuth policies change. Keep this personal.
