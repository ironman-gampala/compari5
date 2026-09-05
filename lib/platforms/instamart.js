import { callMcpTool, setCachedAddressId } from "../auth/mcp.js";
import {
  isConnected as storeConnected,
  readJsonAsync,
  writeJsonAsync,
} from "../auth/store.js";
import { fetchJson, parseRupee } from "../http.js";

const PIN_CACHE_KEY = "swiggy-pin-address";
const NEAR_DEG = 0.0015;

function mapMcpProducts(payload) {
  const data = payload?.data || payload;
  const products = data?.products || data?.similarProducts || [];
  const list = Array.isArray(products) ? products : [];
  const out = [];

  for (const p of list) {
    const variations = Array.isArray(p.variations) ? p.variations : [];
    if (!variations.length) {
      const price = parseRupee(p.offerPrice ?? p.price);
      if (p.displayName && price != null) {
        out.push({
          id: String(p.productId || p.displayName),
          name: p.displayName,
          brand: p.brand || "",
          quantity: "",
          mrp: parseRupee(p.mrp),
          price,
          image: p.imageUrl || "",
          eta: "",
          url: `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(p.displayName)}`,
          platform: "instamart",
        });
      }
      continue;
    }

    for (const v of variations) {
      const price = parseRupee(v.price?.offerPrice ?? v.offerPrice);
      const mrp = parseRupee(v.price?.mrp ?? v.mrp);
      out.push({
        id: String(v.spinId || v.skuId || p.productId),
        name: v.displayName || p.displayName,
        brand: v.brandName || p.brand || "",
        quantity: v.quantityDescription || "",
        mrp,
        price: price ?? mrp,
        image: v.imageUrl || p.imageUrl || "",
        eta: v.sla ? `${v.sla.value} ${v.sla.unit}` : "",
        url: `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(p.displayName || "")}`,
        platform: "instamart",
      });
    }
  }

  return out.filter((p) => p.price != null).slice(0, 24);
}

function walkGuest(node, out, query) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkGuest(item, out, query);
    return;
  }

  const name =
    node.displayName ||
    node.productName ||
    node.name ||
    node.title ||
    node?.variations?.[0]?.displayName;
  const id =
    node.productId ||
    node.spinId ||
    node.skuId ||
    node.id ||
    node?.variations?.[0]?.spinId;

  const price = parseRupee(
    node.offerPrice ??
      node.price?.offerPrice ??
      node.price ??
      node.sellingPrice ??
      node?.variations?.[0]?.price?.offerPrice
  );
  const mrp = parseRupee(
    node.mrp ?? node.price?.mrp ?? node?.variations?.[0]?.price?.mrp ?? price
  );

  if (name && id && price != null) {
    const key = String(id);
    if (!out.some((p) => p.id === key)) {
      out.push({
        id: key,
        name: String(name),
        brand: node.brand || node.brandName || "",
        quantity:
          node.quantityDescription ||
          node.packSize ||
          node?.variations?.[0]?.quantityDescription ||
          "",
        mrp,
        price,
        image: node.imageUrl || node.image || "",
        eta: "",
        url: `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(query || name)}`,
        platform: "instamart",
      });
    }
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === "object") walkGuest(v, out, query);
  }
}

/**
 * Best-effort guest Instamart search (often blocked by WAF on cloud IPs).
 * Returns [] on failure so caller can fall back to OAuth MCP.
 */
async function searchGuest(query, lat, lng) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    origin: "https://www.swiggy.com",
    referer: `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(query)}`,
    cookie: `lat=${lat}; lng=${lng}`,
  };

  const url =
    `https://www.swiggy.com/api/instamart/search/v1?` +
    new URLSearchParams({
      query,
      pageNumber: "0",
      lat: String(lat),
      lng: String(lng),
    });

  const { ok, status, data, text } = await fetchJson(url, { headers });
  if (!ok || status === 202 || !data || (typeof text === "string" && !text.trim())) {
    return [];
  }

  const out = [];
  walkGuest(data, out, query);
  return out.slice(0, 24);
}

function randomPhone() {
  const rest = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  return `9${rest}`;
}

function areaTag(label) {
  const short = String(label || "Pin")
    .split(",")[0]
    .trim()
    .slice(0, 28);
  return `Compari5 · ${short || "Pin"}`;
}

function parseAddressParts(label, extra = {}) {
  const parts = String(label || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const postalFromLabel =
    String(label || "").match(/\b(\d{6})\b/)?.[1] || null;

  const cityGuess =
    extra.city ||
    parts.find((p) =>
      /bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|kakinada|gurgaon|gurugram|noida|ahmedabad|jaipur/i.test(
        p
      )
    ) ||
    parts[parts.length - 3] ||
    parts[1] ||
    "Bengaluru";

  const addressLine =
    extra.addressLine || parts[0] || label || "Delivery pin";

  return {
    fullAddress: label || `${addressLine}, ${cityGuess}, India`,
    addressLine,
    addressLine2: extra.addressLine2 || "",
    locality: extra.locality || parts[0] || "",
    city: cityGuess.replace(/\s*\d{6}\s*/g, "").trim() || "Bengaluru",
    postalCode: extra.postalCode || postalFromLabel || "560001",
  };
}

function samePin(a, lat, lng) {
  if (!a || a.lat == null || a.lng == null) return false;
  return (
    Math.abs(Number(a.lat) - Number(lat)) < NEAR_DEG &&
    Math.abs(Number(a.lng) - Number(lng)) < NEAR_DEG
  );
}

function extractCreatedId(raw) {
  if (!raw) return null;
  if (raw.addressId) return String(raw.addressId);
  if (raw.id) return String(raw.id);
  if (raw.data?.addressId) return String(raw.data.addressId);
  if (raw.data?.id) return String(raw.data.id);
  const text =
    typeof raw === "string"
      ? raw
      : typeof raw?.message === "string"
        ? raw.message
        : JSON.stringify(raw);
  const m =
    text.match(/addressId["\s:]+([A-Za-z0-9_-]{8,})/i) ||
    text.match(/\b([A-Za-z0-9_-]{10,}__[A-Za-z0-9_-]+)\b/);
  return m?.[1] || null;
}

async function listAddresses() {
  const raw = await callMcpTool("swiggy", "get_addresses", {});
  const data = raw?.data || raw;
  const addresses = data?.addresses || data || [];
  return Array.isArray(addresses) ? addresses : [];
}

async function createPinAddress(lat, lng, label, addressMeta) {
  const parts = parseAddressParts(label, addressMeta || {});
  const tag = areaTag(label);
  const payload = {
    ...parts,
    latitude: Number(lat),
    longitude: Number(lng),
    addressCategory: "OTHER",
    addressTag: tag,
    userName: "Compari5",
    userPhone: randomPhone(),
  };

  const raw = await callMcpTool("swiggy", "create_address", payload);
  let id = extractCreatedId(raw);

  if (!id) {
    const list = await listAddresses();
    const match = list.find(
      (a) =>
        String(a.addressTag || "").startsWith("Compari5") &&
        (String(a.addressTag) === tag ||
          String(a.addressLine || "").includes(parts.addressLine.slice(0, 20)))
    );
    id = match?.id || match?.addressId || null;
  }

  if (!id) {
    throw new Error(
      "Could not create a Swiggy address for this pin. Try reconnecting Instamart."
    );
  }

  const record = {
    addressId: id,
    label: tag,
    lat: Number(lat),
    lng: Number(lng),
    created: true,
    saved_at: Date.now(),
  };
  await writeJsonAsync(PIN_CACHE_KEY, record);
  await setCachedAddressId(id, tag);
  return { id, label: tag, created: true };
}

async function resolveAddressForPin(lat, lng, label, addressMeta) {
  const cached = await readJsonAsync(PIN_CACHE_KEY);
  if (cached?.addressId && samePin(cached, lat, lng)) {
    await setCachedAddressId(cached.addressId, cached.label || "Compari5 pin");
    return {
      id: cached.addressId,
      label: cached.label,
      created: false,
    };
  }

  return createPinAddress(lat, lng, label, addressMeta);
}

async function searchViaOAuth(query, lat, lng, options) {
  const connected = await storeConnected("swiggy");
  if (!connected) {
    throw new Error(
      "Instamart needs you to sign in with Swiggy first. Guest search is blocked on this host."
    );
  }

  const label = options.label || "Delivery pin";
  const resolved = await resolveAddressForPin(
    lat,
    lng,
    label,
    options.address || {}
  );

  const raw = await callMcpTool("swiggy", "search_products", {
    addressId: resolved.id,
    query,
  });

  if (raw?.success === false) {
    throw new Error(raw?.error?.message || "Instamart MCP search failed");
  }

  const products = mapMcpProducts(raw);
  if (!products.length) {
    throw new Error("Instamart returned no products for this query.");
  }

  return {
    products,
    meta: {
      source: "oauth",
      addressId: resolved.id,
      addressLabel: resolved.label,
      addressCreated: !!resolved.created,
    },
  };
}

export async function searchInstamart(query, lat, lng, options = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("Instamart needs a valid delivery area pin first.");
  }

  // 1) Guest attempt (works rarely; WAF often returns empty)
  try {
    const guest = await searchGuest(query, lat, lng);
    if (guest.length) {
      return {
        products: guest,
        meta: { source: "guest", addressCreated: false },
      };
    }
  } catch {
    // fall through to OAuth
  }

  // 2) Fallback: Swiggy MCP OAuth (same pattern as Zepto)
  return searchViaOAuth(query, lat, lng, options);
}
