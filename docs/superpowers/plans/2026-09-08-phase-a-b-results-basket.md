# Phase A+B Implementation Plan

> **For agentic workers:** Implement task-by-task. Preserve existing single-search, geocode, adapters, auth.

**Goal:** Results UX (brand enum, unit price, cheapest strip) + basket intelligence (multi-search, matching, saved lists, share link) with polished UI.

**Architecture:** `lib/units.js`, `lib/match.js`, `lib/lists.js` + `app/page.js` / `globals.css`. No API/adapter changes.

**Tech Stack:** Next.js App Router JS, localStorage, existing `/api/search`.

## Global Constraints

- Do not modify `lib/platforms/*` or auth routes.
- Single-query path must behave as today.
- Brand filter = exact match from result brands enum.
- Multi-search = sequential `/api/search` calls.

## Tasks

1. Add `lib/units.js`, `lib/match.js`, `lib/lists.js`
2. Update `app/page.js` for A+B + share hydrate
3. Polish `app/globals.css`
4. `npm run build` verify
