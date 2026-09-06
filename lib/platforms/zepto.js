import { callMcpTool } from "../auth/mcp.js";
import { parseRupee } from "../http.js";

let rateLimitedUntil = 0;
let lastStore = { lat: null, lng: null, storeId: null };

function parseRateLimit(err) {
  const msg = err?.message || String(err);
  if (!/rate_limit/i.test(msg)) return null;
  const match = msg.match(/retry_after_seconds["\s:]+(\d+)/i);
  const seconds = match ? Number(match[1]) : 60;
  return Number.isFinite(seconds) ? seconds : 60;
}

function assertNotRateLimited() {
  const waitMs = rateLimitedUntil - Date.now();
  if (waitMs > 0) {
    const sec = Math.ceil(waitMs / 1000);
    throw new Error(
      `Zepto is rate limited. Try again in about ${sec} seconds.`
    );
  }
}

function asText(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.raw === "string") return payload.raw;
  return JSON.stringify(payload);
}

function extractStoreId(payload) {
  if (payload?.storeId) return String(payload.storeId);
  if (payload?.primaryStoreId) return String(payload.primaryStoreId);
  if (payload?.data?.storeId) return String(payload.data.storeId);

  const text = asText(payload);
  const primary =
    text.match(/Primary store ID:\s*([0-9a-f-]{20,})/i) ||
    text.match(/Store ID:\s*([0-9a-f-]{20,})/i) ||
    text.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
  return primary?.[1] || null;
}

function toRupees(value) {
  const n = parseRupee(value);
  if (n == null) return null;
  // Zepto MCP returns paise (e.g. 1700 => ₹17)
  if (Number.isInteger(n) && n >= 100) return n / 100;
  return n;
}

function mapProducts(raw) {
  const list = raw?.products || raw?.data?.products || [];
  if (!Array.isArray(list)) return [];

  const out = [];
  const seen = new Set();
  for (const p of list) {
    const id = String(
      p.productVariantId || p.variantId || p.id || p.storeProductId || ""
    );
    const name = p.name || p.productName || p.title;
    const price = toRupees(p.price ?? p.sellingPrice ?? p.discountedSellingPrice);
    const mrp = toRupees(p.mrp ?? price);
    if (!id || !name || price == null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(name),
      brand: p.brand || "",
      quantity: p.packSize || p.formattedPacksize || "",
      mrp,
      price,
      image: p.imageUrl || p.image || "",
      eta: "",
      url: `https://www.zeptonow.com/pn/${encodeURIComponent(name)}/pvid/${id}`,
      platform: "zepto",
      availableQuantity: p.availableQuantity,
    });
  }
  return out.slice(0, 24);
}

async function ensureStore(lat, lng) {
  const sameSpot =
    lastStore.storeId &&
    Math.abs(Number(lat) - Number(lastStore.lat)) < 0.0005 &&
    Math.abs(Number(lng) - Number(lastStore.lng)) < 0.0005;

  if (sameSpot) return lastStore.storeId;

  const serviceability = await callMcpTool("zepto", "get_location_serviceability", {
    latitude: Number(lat),
    longitude: Number(lng),
  });

  const text = asText(serviceability);
  if (/does not deliver|not serviceable|coming soon/i.test(text)) {
    throw new Error("Zepto does not deliver to this area yet.");
  }

  const storeId = extractStoreId(serviceability);
  if (!storeId) {
    throw new Error(
      "Could not resolve a Zepto store for this location. Try another nearby area."
    );
  }

  await callMcpTool("zepto", "select_store", {
    storeId,
    latitude: Number(lat),
    longitude: Number(lng),
  });

  lastStore = { lat: Number(lat), lng: Number(lng), storeId };
  return storeId;
}

export async function searchZepto(query, lat, lng) {
  assertNotRateLimited();

  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("Zepto needs a valid delivery area pin first.");
  }

  try {
    await ensureStore(lat, lng);

    const raw = await callMcpTool("zepto", "search_products", {
      query,
      pageNumber: 0,
    });

    const text = asText(raw);
    if (/store not selected/i.test(text)) {
      lastStore = { lat: null, lng: null, storeId: null };
      await ensureStore(lat, lng);
      const retry = await callMcpTool("zepto", "search_products", {
        query,
        pageNumber: 0,
      });
      const products = mapProducts(retry);
      if (!products.length) {
        throw new Error("Zepto returned no products for this search.");
      }
      return products;
    }

    if (/rate_limit/i.test(text)) {
      const retry = parseRateLimit({ message: text }) || 60;
      rateLimitedUntil = Date.now() + retry * 1000;
      throw new Error(
        `Zepto is rate limited. Try again in about ${retry} seconds.`
      );
    }

    const products = mapProducts(raw);
    if (!products.length) {
      throw new Error("Zepto returned no products for this search.");
    }
    return products;
  } catch (err) {
    const retry = parseRateLimit(err);
    if (retry) {
      rateLimitedUntil = Date.now() + retry * 1000;
      throw new Error(
        `Zepto is rate limited. Try again in about ${retry} seconds.`
      );
    }
    throw err;
  }
}
