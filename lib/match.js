import { sizeKey } from "./units.js";

const STOP = new Set([
  "the",
  "and",
  "with",
  "for",
  "pack",
  "combo",
  "fresh",
  "premium",
]);

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, 6)
    .join(" ");
}

export function matchKey(product) {
  const name = normalizeName(product?.name);
  const size = sizeKey(product);
  if (!name) return null;
  if (size) return `${name}|${size}`;
  const brand = String(product?.brand || "")
    .toLowerCase()
    .trim();
  return brand ? `${brand}|${name}` : name;
}

/**
 * Group products that appear on 2+ platforms.
 * Within a group, keep the cheapest product per platform.
 */
export function buildMatchGroups(products, platformIds) {
  const map = new Map();
  for (const prod of products || []) {
    if (prod?.price == null) continue;
    const key = matchKey(prod);
    if (!key) continue;
    if (!map.has(key)) map.set(key, new Map());
    const byPlat = map.get(key);
    const prev = byPlat.get(prod.platform);
    if (!prev || prod.price < prev.price) byPlat.set(prod.platform, prod);
  }

  const groups = [];
  for (const [key, byPlat] of map) {
    if (byPlat.size < 2) continue;
    const items = {};
    let title = "";
    let quantity = "";
    let bestPrice = Infinity;
    for (const id of platformIds) {
      const p = byPlat.get(id);
      if (p) {
        items[id] = p;
        if (!title) title = p.name;
        if (!quantity) quantity = p.quantity || "";
        if (p.price < bestPrice) bestPrice = p.price;
      }
    }
    groups.push({
      key,
      title,
      quantity,
      items,
      bestPrice: Number.isFinite(bestPrice) ? bestPrice : null,
      platformCount: Object.keys(items).length,
    });
  }

  groups.sort(
    (a, b) =>
      b.platformCount - a.platformCount ||
      (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity)
  );
  return groups;
}

export function collectBrands(results, platformIds) {
  const set = new Map();
  for (const id of platformIds) {
    for (const p of results?.[id]?.products || []) {
      const b = String(p.brand || "").trim();
      if (!b) continue;
      const k = b.toLowerCase();
      if (!set.has(k)) set.set(k, b);
    }
  }
  return Array.from(set.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}
