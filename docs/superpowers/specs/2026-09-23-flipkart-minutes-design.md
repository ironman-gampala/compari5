# Flipkart Minutes replaces FirstClub

**Date:** 2026-09-23  
**Status:** Implemented

## Goal

Remove FirstClub (app-only, no guest catalog). Add **Flipkart Minutes** as the fifth quick-commerce store in Compari5.

## Approach

Direct Flipkart rome API (same class as BigBasket), Impit + guest cookies:

1. `POST /api/1/location/serviceability` with lat/lng  
2. `POST /api/4/location/update` with `geoLocation` + `addressInfo` + `marketplace: HYPERLOCAL`  
   (this is what the in-app **Confirm** address step does — without it, search stays on the preview gate / empty catalog)  
3. `POST /api/4/page/fetch` with `pageUri` like `/search?q=…&marketplace=HYPERLOCAL&pincode=…`

Soft-fail with a clear message when Minutes is not serviceable or Flipkart blocks.

Not in scope: headless browser on Netlify, paid third-party APIs.

## Product mapping

Same Compari5 shape: `id`, `name`, `brand`, `quantity`, `mrp`, `price`, `image`, `eta`, `url`, `platform: "minutes"`.

## UI

Keep the existing 5-card layout; swap FirstClub → Minutes (label, logo, fallbacks, basket totals, copy).

## Files

- Remove: `lib/platforms/firstclub.js`, `public/logos/firstclub.png`, FirstClub env notes
- Add: `lib/platforms/minutes.js`, `public/logos/minutes.png`
- Update: `lib/platforms/index.js`, `app/page.js`, README, `.env.example`
