# Compari5 — Personal Quick Commerce Price Compare

## Goal

Local-only JS web app to compare grocery prices across **Blinkit**, **Swiggy Instamart**, and **Zepto** for personal use. No site login, no checkout, no paid APIs.

## Constraints

- JavaScript only (no Python / MCP in the core path)
- Free to run (your machine + platform guest search)
- You may later add session cookies if guest search is blocked
- Location: type any area each time (geocode → lat/lng)
- Multi-item shopping list with per-platform totals

## Architecture

Single **Next.js (App Router) JavaScript** project:

| Piece | Role |
|-------|------|
| UI | Location picker, product search, results grid, shopping list |
| `GET /api/geocode` | Area → suggestions + lat/lng (Nominatim) |
| `GET /api/search` | Parallel search on three platforms |
| `lib/platforms/*` | One adapter per platform, shared product shape |

### Normalized product

```js
{
  id, name, brand, quantity, mrp, price,
  image, eta, url, platform // 'blinkit' | 'instamart' | 'zepto'
}
```

### Flow

1. User picks location → store lat/lng in client state (+ localStorage)
2. User searches query → `/api/search` fans out to three adapters
3. UI shows three columns; highlight cheapest per result group
4. User adds items (with qty) to a list → totals per platform
5. Optional “Open” link to platform product/search URL

## UX (v1)

- Delivering-to chip + change location
- Search results with Blinkit | Instamart | Zepto prices/ETA
- Soft per-platform errors (“Blinkit timed out”)
- Shopping list: qty, remove, running totals, cheapest platform for cart
- Persist list + last location in `localStorage`

## Out of scope (v1)

- User accounts, checkout, payments, coupons
- Auto SKU matching across platforms (manual add from search)
- Playwright / official MCP servers as primary data path
- Paid aggregator APIs (QuickCommerce API etc.)

## Error handling

- Per-platform timeout (~10s); partial results OK
- Clear empty/error states per column
- README notes for optional cookies if needed later

## Testing (light)

- Manual: geocode a known area, search “amul milk”, confirm three columns + list totals
- Adapter unit smoke: mock fetch → normalized shape

## Success criteria

You can set any area, search products, build a multi-item list, and see which platform is cheapest for that list — without paying or checking out.
