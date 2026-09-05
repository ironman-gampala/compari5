# Uniform location, Instamart on-the-fly address, filters

## Goal
One delivery area pin for Blinkit, Instamart, and Zepto. Better results tooling and clearer typography.

## Location
- Remove Instamart address dropdown / refresh address from UI.
- Instamart: try guest web search first; **fallback to Swiggy MCP OAuth** (create pin address when needed).
- Soft dismissible note when an address was auto-created.

## Netlify auth
- `COMPARI5_BASE_URL` for OAuth redirects (no hardcoded localhost in callbacks).
- Tokens: `.data/` locally; Netlify Blobs when `NETLIFY` is set.

## Results
- Sort: price asc/desc, biggest save vs MRP, name A–Z.
- Filters: in stock, has discount, brand contains, max price.
