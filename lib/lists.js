const SAVED_KEY = "compari5.savedLists";
const MAX_LISTS = 20;

export function loadSavedLists() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function persistSavedLists(lists) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(lists.slice(0, MAX_LISTS)));
}

export function saveNamedList(lists, { name, items, location }) {
  const entry = {
    id: `list_${Date.now().toString(36)}`,
    name: String(name || "My list").trim().slice(0, 60) || "My list",
    savedAt: Date.now(),
    items: Array.isArray(items) ? items : [],
    location: location
      ? {
          lat: location.lat,
          lng: location.lng,
          label: location.label,
          city: location.city,
          postalCode: location.postalCode,
          locality: location.locality,
        }
      : null,
  };
  return [entry, ...lists.filter((l) => l.id !== entry.id)].slice(0, MAX_LISTS);
}

export function deleteSavedList(lists, id) {
  return lists.filter((l) => l.id !== id);
}

function toBase64Url(str) {
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const full = b64 + pad;
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(full)));
  }
  return Buffer.from(full, "base64").toString("utf8");
}

/** Compact share payload */
export function encodeBasketPayload({ location, items }) {
  const payload = {
    v: 1,
    loc: location
      ? {
          lat: location.lat,
          lng: location.lng,
          label: location.label,
          city: location.city || undefined,
          postalCode: location.postalCode || undefined,
          locality: location.locality || undefined,
        }
      : null,
    items: (items || []).map((i) => ({
      k: i.key,
      p: i.platform,
      id: i.id,
      n: i.name,
      q: i.quantity,
      pr: i.price,
      m: i.mrp,
      u: i.url,
      i: i.image,
      e: i.eta,
      qq: i.query,
      qty: i.qty,
    })),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeBasketPayload(encoded) {
  if (!encoded || encoded.length > 12000) return null;
  try {
    const data = JSON.parse(fromBase64Url(encoded));
    if (!data || data.v !== 1 || !Array.isArray(data.items)) return null;
    const items = data.items.map((i) => ({
      key: i.k,
      platform: i.p,
      id: i.id,
      name: i.n,
      quantity: i.q,
      price: i.pr,
      mrp: i.m,
      url: i.u,
      image: i.i,
      eta: i.e,
      query: i.qq || i.n,
      qty: i.qty || 1,
    }));
    const location = data.loc
      ? {
          lat: data.loc.lat,
          lng: data.loc.lng,
          label: data.loc.label,
          city: data.loc.city,
          postalCode: data.loc.postalCode,
          locality: data.loc.locality,
        }
      : null;
    return { items, location };
  } catch {
    return null;
  }
}

export function buildShareUrl(origin, payload) {
  return `${origin.replace(/\/$/, "")}/?basket=${payload}`;
}

export function splitSearchTerms(query) {
  const parts = String(query || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
