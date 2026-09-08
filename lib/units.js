/**
 * Parse pack size and format unit price (₹/L or ₹/100g).
 */

export function parseSize(text) {
  const s = String(text || "").toLowerCase().replace(/,/g, "");
  if (!s.trim()) return null;

  let m = s.match(/(\d+(?:\.\d+)?)\s*(ml|millilitre|milliliter)s?\b/);
  if (m) return { kind: "volume", liters: Number(m[1]) / 1000, label: `${m[1]} ml` };

  m = s.match(/(\d+(?:\.\d+)?)\s*(l|ltr|liter|litre|liters|litres)\b/);
  if (m) return { kind: "volume", liters: Number(m[1]), label: `${m[1]} L` };

  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms)\b/);
  if (m) return { kind: "weight", grams: Number(m[1]) * 1000, label: `${m[1]} kg` };

  m = s.match(/(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams)\b/);
  if (m) return { kind: "weight", grams: Number(m[1]), label: `${m[1]} g` };

  return null;
}

export function parseProductSize(product) {
  return (
    parseSize(product?.quantity) ||
    parseSize(product?.name) ||
    null
  );
}

/** @returns {string|null} e.g. "₹48/L" or "₹12/100g" */
export function formatUnitPrice(product) {
  const price = product?.price;
  if (price == null || !Number.isFinite(Number(price))) return null;
  const size = parseProductSize(product);
  if (!size) return null;

  if (size.kind === "volume" && size.liters > 0) {
    const perL = Number(price) / size.liters;
    if (!Number.isFinite(perL) || perL <= 0) return null;
    return `₹${Math.round(perL)}/L`;
  }
  if (size.kind === "weight" && size.grams > 0) {
    const per100 = (Number(price) / size.grams) * 100;
    if (!Number.isFinite(per100) || per100 <= 0) return null;
    return `₹${Math.round(per100)}/100g`;
  }
  return null;
}

export function sizeKey(product) {
  const size = parseProductSize(product);
  if (!size) return "";
  if (size.kind === "volume") return `v:${Math.round(size.liters * 1000)}`;
  if (size.kind === "weight") return `w:${Math.round(size.grams)}`;
  return "";
}
