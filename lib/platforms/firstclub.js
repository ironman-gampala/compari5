import { fetchJson, parseRupee } from "../http.js";

const API = "https://prod-heimdall.firstclub.tech";
const ORDER_ORIGIN = "https://order.firstclub.co.in";
const HOME_PAGE_ID = "f4f8e3ec-c0f5-4799-8bbe-c9e587561046";
const DEFAULT_WAREHOUSE = "FCHBLRSJR01";
const APP_ONLY_MESSAGE =
  "FirstClub is app-only (Bengaluru & Hyderabad). No public web catalog to compare yet — open firstclub.site.";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sessionHeaders() {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    origin: ORDER_ORIGIN,
    referer: `${ORDER_ORIGIN}/`,
    "user-agent": UA,
  };
  const sessionId = process.env.FIRSTCLUB_SESSION_ID?.trim();
  const userId = process.env.FIRSTCLUB_USER_ID?.trim();
  if (sessionId) headers["X-Session-Id"] = sessionId;
  if (userId) headers["X-User-Id"] = userId;
  return { headers, userId: userId || "", sessionId: sessionId || "" };
}

async function fcPost(path, body) {
  const { headers } = sessionHeaders();
  const { ok, status, data, text } = await fetchJson(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      text ||
      `HTTP ${status}`;
    throw new Error(String(msg));
  }
  return data;
}

function collectCategories(node, out = [], seen = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectCategories(item, out, seen);
    return out;
  }
  const id = node.categoryId || node.subCategoryId || node.id;
  const name = node.displayName || node.name || node.title || "";
  if (
    id &&
    typeof id === "string" &&
    id.includes("-") &&
    name &&
    !seen.has(id)
  ) {
    seen.add(id);
    out.push({ id, name: String(name) });
  }
  for (const value of Object.values(node)) {
    collectCategories(value, out, seen);
  }
  return out;
}

function productImage(p) {
  return (
    p.displayAssetUrl ||
    p.imageUrl ||
    p.asset?.url ||
    p.assets?.[0]?.fileLocationPath ||
    p.assets?.[0]?.url ||
    ""
  );
}

function mapProduct(p) {
  const id = String(p.fsn || p.listingId || "");
  const name = String(p.displayName || p.productTitle || p.name || "").trim();
  const price = parseRupee(
    p.price?.oneTimePrice?.memberPrice ??
      p.price?.oneTimePrice?.nonMemberPrice ??
      p.price?.sellingPrice ??
      p.price?.mrp ??
      p.sellingPrice
  );
  const mrp = parseRupee(p.price?.mrp ?? p.maxRetailPrice ?? price);
  if (!id || !name || price == null) return null;

  const slotId = p.slots?.[0]?.slotId || p.slots?.[0]?.id || "";
  const qs = new URLSearchParams({ fsn: id });
  if (slotId) qs.set("slotId", String(slotId));

  return {
    id,
    name,
    brand: String(p.brand || p.brandName || ""),
    quantity: String(p.quantity || p.packSize || ""),
    mrp,
    price,
    image: productImage(p),
    eta: "",
    url: `${ORDER_ORIGIN}/pdp?${qs.toString()}`,
    platform: "firstclub",
  };
}

function scoreMatch(product, tokens) {
  const hay = `${product.name} ${product.brand} ${product.quantity}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 1;
  }
  return score;
}

async function resolveWarehouse(lat, lng, options = {}) {
  const { userId } = sessionHeaders();
  const pin = String(options.address?.postalCode || "").replace(/\D/g, "").slice(0, 6);
  const body = { userId: userId || "" };
  if (pin.length === 6) body.pincode = Number(pin);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    body.geometry = { latitude: lat, longitude: lng };
  }

  try {
    const data = await fcPost(
      "/api/v1/page/user-profile/serviceability/pincode",
      body
    );
    const store = data?.body?.stores?.[0];
    const warehouse =
      store?.serviceabilityData?.warehouseID ||
      store?.warehouseId ||
      store?.warehouseID ||
      store?.id;
    if (warehouse) return { warehouseId: String(warehouse) };
  } catch {
    // Fall through to default ClubHouse used by FirstClub's web shell.
  }

  return { warehouseId: DEFAULT_WAREHOUSE };
}

async function fetchCategories(userId) {
  const data = await fcPost(
    "/api/v1/serving-orchestrator/home/msite/widget?apiVersion=v2",
    {
      pageId: HOME_PAGE_ID,
      userContext: {
        userId: userId || "",
        address: { addressId: "" },
      },
    }
  );
  return collectCategories(data).slice(0, 12);
}

async function fetchCategoryProducts(warehouseId, categoryId, pageNumber = 1) {
  const data = await fcPost(
    "/api/v1/serving-orchestrator/browse/msite/subcategory/products",
    {
      subCategoryId: [categoryId],
      warehouseId,
      pageNumber,
      purchaseType: "ONCE",
    }
  );
  const listings = data?.body?.productListings || {};
  const first = Object.values(listings)[0];
  return Array.isArray(first) ? first : [];
}

async function searchWithSession(query, lat, lng, options = {}) {
  const { userId } = sessionHeaders();
  const { warehouseId } = await resolveWarehouse(lat, lng, options);

  let categories = [];
  try {
    categories = await fetchCategories(userId);
  } catch (err) {
    const msg = err?.message || String(err);
    if (/Internal server error|500/i.test(msg)) {
      throw new Error(APP_ONLY_MESSAGE);
    }
    if (/401|406|407|408|409|session|auth/i.test(msg)) {
      throw new Error(APP_ONLY_MESSAGE);
    }
    throw new Error(msg);
  }

  if (!categories.length) {
    throw new Error(
      "FirstClub returned no categories for this area (Bengaluru & Hyderabad only)."
    );
  }

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);

  const batches = await Promise.all(
    categories.slice(0, 8).map(async (cat) => {
      try {
        return await fetchCategoryProducts(warehouseId, cat.id, 1);
      } catch {
        return [];
      }
    })
  );

  const seen = new Set();
  const scored = [];
  for (const raw of batches.flat()) {
    const product = mapProduct(raw);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    const score = tokens.length ? scoreMatch(product, tokens) : 1;
    if (score > 0) scored.push({ product, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.product.price - b.product.price
  );

  if (!scored.length) {
    throw new Error(
      "No FirstClub matches for this search. Available in Bengaluru & Hyderabad."
    );
  }

  return scored.map((s) => s.product).slice(0, 24);
}

export async function searchFirstclub(query, lat, lng, options = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const { sessionId, userId } = sessionHeaders();
  // Guest catalog is not exposed. Only attempt Heimdall when a session is configured.
  if (!sessionId || !userId) {
    throw new Error(APP_ONLY_MESSAGE);
  }

  return searchWithSession(q, lat, lng, options);
}
