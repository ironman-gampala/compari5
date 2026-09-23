# Results UI polish (filters, match board, alignment)

**Date:** 2026-09-23  
**Status:** Approved (product owner: “you take the call”)

## Goal

Bring the Compari5 results surface to a clean Silicon Valley SaaS standard: no overlapping chrome, filters that support multi-select, and cross-store matches as a secondary expandable below the main grid.

## Decisions

1. **Platform column header** — Stop absolutely positioning the “Cheapest” pill over the title/`from ₹` row. Use a single flex header: logo + name on the left, `from ₹` + optional Cheapest chip on the right (wraps cleanly on narrow columns).
2. **Same item, all stores** — Move below `PlatformColumns`. Collapsed by default (`details`/`summary` pattern). Expanding reveals the match rows.
3. **Brand filter** — Replace single `<select>` with a multi-select chip popover (checkboxes). `filters.brands: string[]`. Empty = all brands.
4. **Filter bar** — Keep Sort / Max ₹ / On offer / In stock / Reset; tighten spacing and alignment so controls share one baseline.
5. **Verification** — Puppeteer script asserts no bounding-box overlap between `.platform-win-tag` (or cheapest chip) and `.floor`, and that MatchBoard appears after the platform grid in DOM order.

## Out of scope

New visual brand, dark mode, filter persistence across sessions.
