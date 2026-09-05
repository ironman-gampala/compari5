# Compari5

Personal quick-commerce price compare for **Blinkit**, **Swiggy Instamart**, **Zepto**, and **BigBasket**.

No site accounts. No checkout. Free to run locally.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Connect Swiggy** / **Connect Zepto** (phone OTP in browser, once)
2. Type an area (Blinkit uses this pin)
3. Search a product → compare → add to list → see totals

## Area search (maps)

Uses **Google Places Autocomplete** + **Place Details** (Geocoding as fallback).

1. Enable **Places API** and **Geocoding API** in [Google Cloud Console](https://console.cloud.google.com/apis/library)
2. Put your key in `.env.local` (never commit it):

```bash
GOOGLE_MAPS_API_KEY=your_key_here
```

3. Restrict the key (Application restrictions → IP for local server, or none while testing)
4. Restart `npm run dev`

Without a key, we fall back to OpenStreetMap Nominatim.

## Auth (OTP)

| Platform | How |
|----------|-----|
| **Blinkit** | Works without login |
| **Instamart** | Tries guest search, then **Swiggy MCP OAuth** (OTP) as fallback |
| **Zepto** | Official Zepto MCP OAuth → OTP |
| **BigBasket** | Guest web search (no login) |

Instamart uses the **same area pin** as Blinkit and Zepto. With OAuth, Compari5 may auto-create a temporary Swiggy address tagged `Compari5 · …`.

Tokens: `.data/` locally; **Netlify Blobs** when deployed (`NETLIFY=true`).

## Deploy on Netlify

1. Set env vars in Netlify:
   - `COMPARI5_BASE_URL=https://YOUR-SITE.netlify.app`
   - `GOOGLE_MAPS_API_KEY=…`
2. Deploy (uses `@netlify/plugin-nextjs` from `netlify.toml`).
3. Connect Swiggy / Zepto via OTP on the live URL.
4. If Swiggy blocks MCP for your domain, Instamart guest search may still fail — OAuth is the supported path to test.

## Stack

- Next.js (App Router) + JavaScript
- Nominatim geocoding
- `impit` for Blinkit
- `@modelcontextprotocol/sdk` for Swiggy / Zepto MCP

## Disclaimer

Unofficial personal tool. Not affiliated with Blinkit, Swiggy, or Zepto.
