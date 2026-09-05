# Compari5 Implementation Plan

> **For agentic workers:** Inline execution — user requested build immediately.

**Goal:** Personal JS Next.js app to compare Blinkit / Instamart / Zepto prices for a multi-item list.

**Architecture:** Next.js App Router (JS). Geocode via Nominatim. Blinkit via `impit` Chrome-TLS API. Instamart/Zepto via optional browser cookies in `.env` (WAF/login gated). Parallel `/api/search`.

**Tech Stack:** Next.js, React, impit, plain CSS

---

### Task 1: Scaffold + geocode + Blinkit + UI list
### Task 2: Instamart + Zepto cookie adapters
### Task 3: Wire search UI, list totals, README
