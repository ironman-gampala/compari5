# Compari5 Phase A + B — Results UX & basket intelligence

**Date:** 2026-09-08  
**Status:** Approved for planning  
**Approach:** Client helpers + existing APIs (no platform adapter changes)

## Goal

Ship Phase A (results UX) and Phase B (basket intelligence) without breaking geocode, single-query search, platform columns, basket qty/remove, staples, auth cards, or Netlify deploy behavior.

## Non-goals

- Blinkit residential proxy / cloud 403 fixes  
- Swiggy/Zepto token health banner (Phase C)  
- Deal alerts, OCR, WhatsApp, dark mode, new stores  
- New batch/match server APIs  
- Checkout, accounts, delivery fee estimation from live APIs  

## Architecture

```
app/page.js  (orchestration + UI)
  ├── lib/units.js     parse size → unit price display
  ├── lib/match.js     normalize + group cross-store products
  └── lib/lists.js     saved lists encode/decode + share payload helpers

Existing:
  GET /api/geocode  (unchanged)
  GET /api/search   (unchanged; called once per multi-search term)
```

All new persistence uses **localStorage** (and optional URL query for share). No Netlify Blobs changes.

### New localStorage keys

| Key | Purpose |
|-----|---------|
| `compari5.savedLists` | Named baskets `[{ id, name, savedAt, items, location? }]` |
| Existing `compari5.list` / `compari5.location` / staples / history | Unchanged |

Share URL uses `?basket=<base64url(json)>` (compact: location label/lat/lng + items). On load, if present, hydrate list (+ location when lat/lng present) and strip the param after apply.

---

## Phase A — Results UX

### A1. Brand filter as enum

- Derive brand options from **current** `results` (union across platforms): non-empty `product.brand`, trimmed, case-insensitive unique, sorted A–Z.
- UI: `<select>` with option **All brands** (`value=""`) plus each brand.
- Filter: exact case-insensitive match on `product.brand` (not substring on name).
- When new results arrive, if selected brand is not in the new set, reset brand to `""`.
- Keep in-stock, has-discount, max-price, and sort as today; polish layout only (labels, spacing, clear-all).

### A2. Unit price

- `lib/units.js`: parse common patterns from `quantity` then `name` (e.g. `500 ml`, `1 L`, `1l`, `200g`, `1 kg`, `12 pcs` → skip unit price for count-only).
- Prefer **₹/L** for volume, **₹/100g** for weight.
- Show on product cards only when parse + price succeed; otherwise omit (no fake zeros).

### A3. Cheapest strip

- Below the filter row / above platform columns when there are priced products in **filtered** results.
- Copy: e.g. `Lowest in this search: Instamart at ₹X` and when ≥2 platforms have prices, `· saves ₹Y vs next`.
- Uses filtered set so brand/max-price etc. apply.
- Does not replace per-column cheapest highlighting.

---

## Phase B — Basket intelligence

### B1. Multi-item search

- Split `productQuery` on commas and newlines; trim; drop empty; dedupe case-insensitively; require each term length ≥ 2.
- **One term** → existing single-search path (same UI as today).
- **Multiple terms** → sequential `GET /api/search` (await each) to avoid Netlify/platform pile-ups.
  - Progress toast/label: `Searching 2/3: bread…`
  - Store `multiResults: [{ query, results, error? }]`
  - Render one section per query (reuse column/card patterns).
  - Per section: **Add cheapest** for that query (respects current filters).
- Failure of one term does not abort others; show error under that section.
- Single-search `results` state remains for the one-query path so existing code paths stay intact.

### B2. Cross-store matching

- `lib/match.js`: normalize name (lowercase, strip punctuation, collapse spaces), normalize size token from quantity/name.
- Match key ≈ `normalizedName + "|" + sizeKey` (size optional; if missing, name-only groups only when brands match or names are near-identical — prefer **same sizeKey** when present to avoid bad merges).
- Within each search’s combined products, build **match groups** with up to one product per platform (cheapest per platform in group).
- UI: optional **Matched** block above or within results showing group rows (name, size, four prices, add per cell). Products not in a multi-platform group still appear in platform columns as today.
- Matching is **display + add helpers only**; does not change API payloads.

### B3. Saved lists

- Actions on basket: **Save list** (prompt/name input), **Load** (select), **Delete** saved.
- Saved payload: `{ id, name, savedAt, items: [...basket items], location?: { lat, lng, label } }`.
- Load replaces current basket (confirm if basket non-empty). Optionally restore location if saved with list.
- Cap ~20 saved lists; newest first.

### B4. Share basket link

- **Copy link** builds `origin/?basket=<payload>` and copies to clipboard.
- Keep existing **copy text** share as secondary (already present).
- On first mount, parse `basket` query → set list (+ location if included) → `history.replaceState` to clean URL → toast.
- Invalid/oversized payload → ignore + soft error; do not clear existing basket.

---

## Error handling

- Multi-search: per-term errors; global banner only for “no location” / empty query.
- Share decode failures: toast or inline error; no throw.
- Unit/match parse failures: silent fallback (no unit line / no group).

## Testing (manual)

1. Single search “amul milk” — columns, brand dropdown populated, unit price when parseable, cheapest strip, filters still work.  
2. Multi-search `milk, bread` — sequential progress, two sections, one platform failure still shows the other.  
3. Matched row appears when same SKU-ish item on 2+ stores; add from matched cell updates basket.  
4. Save / load / delete list; reload page persists saved lists.  
5. Copy share link → open in new tab → basket restored.  
6. Staples, geocode, Open product, existing basket qty — unchanged.

## Success criteria

- Phase A filters + unit price + cheapest strip usable on live single search.  
- Phase B multi-search, matching, saved lists, and share link work locally and on Netlify without adapter or env changes.  
- No regression on single-query compare flow.
