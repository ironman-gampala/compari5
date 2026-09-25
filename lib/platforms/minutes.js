import { fetchJson, parseRupee, withTimeout } from "../http.js";
import {
  getProxyBaseUrl,
  proxyConfigured,
  proxySecret,
} from "../proxy-url.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const X_UA = "Mozilla/5.0 FKUA/website/42/website/Desktop";

let session = {
  cookies: "",
  host: "2.rome.api.flipkart.com",
  locationKey: "",
};

async function searchViaProxy(query, lat, lng, options = {}) {
  const base = await getProxyBaseUrl();
  if (!base) throw new Error("Minutes proxy URL is not configured.");
  const secret = proxySecret();
  const pin =
    String(options.address?.postalCode || "").replace(/\D/g, "").slice(0, 6) ||
    String(options.label || "").match(/\b(\d{6})\b/)?.[1] ||
    "";
  const url =
    `${base}/minutes?` +
    new URLSearchParams({
      q: query,
      lat: String(lat),
      lng: String(lng),
      label: options.label || "",
      city: options.address?.city || "",
      postalCode: pin,
      locality: options.address?.locality || "",
      state: options.address?.state || "",
    });

  const { ok, status, data } = await withTimeout(
    fetchJson(url, {
      headers: {
        accept: "application/json",
        "bypass-tunnel-reminder": "true",
        ...(secret ? { "x-compari5-proxy-secret": secret } : {}),
      },
    }),
    30000,
    "minutes-proxy"
  );

  if (!ok) {
    const err = data?.error || `Minutes proxy failed (${status || "error"})`;
    if (/timed out|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(err)) {
      throw new Error(
        "Flipkart Minutes proxy is unreachable. Keep the home Impit tunnel running (services/blinkit-proxy/start-home-tunnel.sh)."
      );
    }
    throw new Error(err);
  }

  const products = Array.isArray(data?.products) ? data.products : [];
  if (!products.length) {
    throw new Error("Flipkart Minutes returned no products for this search.");
  }
  return products.slice(0, 24);
}


function absorbSetCookie(setCookie) {
  if (!setCookie?.length) return;
  const map = new Map();
  for (const part of String(session.cookies || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    map.set(part.split("=")[0], part);
  }
  for (const raw of setCookie) {
    const part = String(raw).split(";")[0];
    const name = part.split("=")[0];
    if (name) map.set(name, part);
  }
  session.cookies = [...map.values()].join("; ");
}

async function ensureHomeCookies() {
  if (session.cookies) return;
  const { setCookie } = await fetchJson("https://www.flipkart.com/", {
    headers: { "user-agent": UA, accept: "text/html" },
  });
  absorbSetCookie(setCookie);
}

function resolvePin(options = {}) {
  return (
    String(options.address?.postalCode || "").replace(/\D/g, "").slice(0, 6) ||
    String(options.label || "").match(/\b(\d{6})\b/)?.[1] ||
    ""
  );
}

function addressParts(options = {}, pin) {
  const label = String(options.label || "");
  const parts = label
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const city =
    options.address?.city ||
    parts.find((p) =>
      /bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|gurgaon|gurugram|noida/i.test(
        p
      )
    ) ||
    parts[1] ||
    "Bengaluru";
  const state =
    options.address?.state ||
    parts.find((p) =>
      /karnataka|maharashtra|delhi|telangana|tamil nadu|west bengal|haryana|uttar pradesh/i.test(
        p
      )
    ) ||
    "Karnataka";
  const line =
    options.address?.locality ||
    options.address?.addressLine ||
    parts[0] ||
    `Pincode ${pin}`;
  return {
    addressLine1: String(line).slice(0, 120),
    city: String(city).replace(/\s*\d{6}\s*/g, "").trim() || "Bengaluru",
    state: String(state).trim() || "Karnataka",
    pincode: String(pin),
  };
}

function pickText(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") {
      if (typeof c.text === "string" && c.text.trim()) return c.text.trim();
      if (typeof c.value === "string" && c.value.trim()) return c.value.trim();
      if (typeof c.title === "string" && c.title.trim()) return c.title.trim();
      if (c.value && typeof c.value.text === "string") return c.value.text.trim();
    }
  }
  return "";
}

function pickPrice(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number") return parseRupee(c);
    if (typeof c === "string") return parseRupee(c);
    if (typeof c === "object") {
      const nested = parseRupee(
        c.value ?? c.price ?? c.finalPrice ?? c.sellingPrice ?? c.amount
      );
      if (nested != null) return nested;
    }
  }
  return null;
}

function pickImage(node) {
  const img =
    node?.images?.[0]?.imageUrl ||
    node?.images?.[0]?.url ||
    node?.media?.images?.[0]?.url ||
    node?.productImage?.url ||
    node?.imageUrl ||
    node?.image ||
    "";
  if (!img) return "";
  return String(img)
    .replace("{@width}", "200")
    .replace("{@height}", "200")
    .replace("{@quality}", "70");
}

function mapNode(node, query, out, seen) {
  if (!node || typeof node !== "object") return;

  const value = node.value && typeof node.value === "object" ? node.value : node;
  const id = String(
    value.productId ||
      value.id ||
      value.pid ||
      value.listingId ||
      node.productId ||
      ""
  );
  const name = pickText(
    value.titles?.title,
    value.title,
    value.productTitle,
    value.name,
    value.titles?.newTitle
  );
  const price = pickPrice(
    value.pricing?.finalPrice,
    value.pricing?.displayPrice,
    value.pricing?.price,
    value.finalPrice,
    value.sellingPrice,
    value.price
  );
  const mrp = pickPrice(
    value.pricing?.mrp,
    value.pricing?.strikeOffPrice,
    value.mrp,
    price
  );

  if (id && name && price != null && !seen.has(id)) {
    seen.add(id);
    const brand = pickText(value.productBrand, value.brand, value.titles?.superTitle);
    const quantity = pickText(
      value.titles?.subtitle,
      value.quantity,
      value.unit,
      value.packSize
    );
    const path =
      value.action?.url ||
      value.smartUrl ||
      value.url ||
      `/search?q=${encodeURIComponent(query)}&marketplace=HYPERLOCAL`;
    out.push({
      id,
      name:
        brand && !name.toLowerCase().startsWith(brand.toLowerCase())
          ? `${brand} ${name}`
          : name,
      brand: brand || "",
      quantity,
      mrp: mrp ?? price,
      price,
      image: pickImage(value),
      eta: pickText(value.deliveryMessage, value.eta, value.slaText) || "",
      url: path.startsWith("http")
        ? path
        : `https://www.flipkart.com${path.startsWith("/") ? path : `/${path}`}`,
      platform: "minutes",
    });
  }

  if (Array.isArray(node)) {
    for (const item of node) mapNode(item, query, out, seen);
    return;
  }
  for (const child of Object.values(node)) {
    if (child && typeof child === "object") mapNode(child, query, out, seen);
  }
}

function isDcChange(status, data) {
  if (data?.ERROR_MESSAGE === "DC Change") return true;
  if (status === 406 && (data?.RESPONSE?.id || data?.META_INFO?.dcInfo?.id)) {
    return true;
  }
  return false;
}

async function romePost(path, body) {
  await ensureHomeCookies();
  let host = session.host || "2.rome.api.flipkart.com";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { ok, status, data, text, setCookie } = await fetchJson(
      `https://${host}${path}`,
      {
        method: "POST",
        headers: {
          "user-agent": UA,
          "x-user-agent": X_UA,
          flipkart_secure: "true",
          accept: "*/*",
          "content-type": "application/json",
          origin: "https://www.flipkart.com",
          referer: "https://www.flipkart.com/",
          cookie: session.cookies,
        },
        body: JSON.stringify(body),
      }
    );
    absorbSetCookie(setCookie);

    if (isDcChange(status, data)) {
      const id =
        data?.RESPONSE?.id || data?.META_INFO?.dcInfo?.id || String(attempt + 2);
      host = `${id}.rome.api.flipkart.com`;
      session.host = host;
      continue;
    }

    if (!ok && status !== 200) {
      throw new Error(
        data?.ERROR_MESSAGE || `Flipkart Minutes request failed (${status})`
      );
    }

    session.host = host;
    return { data, text: typeof text === "string" ? text : JSON.stringify(data) };
  }

  throw new Error("Flipkart Minutes could not reach a working datacenter.");
}

async function ensureLocation(lat, lng, pin, options = {}) {
  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${pin}`;
  if (session.locationKey === key) return;

  const svc = await romePost("/api/1/location/serviceability", {
    latitude: Number(lat),
    longitude: Number(lng),
  });
  if (svc.data?.RESPONSE?.serviceable === false) {
    throw new Error(
      "Flipkart Minutes is not serviceable at this pincode yet."
    );
  }

  const addressInfo = addressParts(options, pin);
  await romePost("/api/4/location/update", {
    geoLocation: {
      latitude: Number(lat),
      longitude: Number(lng),
    },
    addressInfo,
    redirectionUrl: `/search?q=milk&marketplace=HYPERLOCAL&pincode=${pin}`,
    marketplace: "HYPERLOCAL",
  });

  session.locationKey = key;
}

export async function searchMinutes(query, lat, lng, options = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("Flipkart Minutes needs a valid delivery area pin first.");
  }

  const q = String(query || "").trim();
  if (q.length < 2) return [];

  // Prefer home Impit proxy on Netlify (Flipkart often blocks cloud TLS).
  // If the tunnel is down, fall through to direct fetch.
  if (await proxyConfigured()) {
    try {
      return await searchViaProxy(q, lat, lng, options);
    } catch (err) {
      console.warn("minutes proxy failed, trying direct:", err?.message || err);
    }
  }

  // Fresh Flipkart jar per search — serverless reuse otherwise sticks on preview gate.
  session = {
    cookies: "",
    host: "2.rome.api.flipkart.com",
    locationKey: "",
  };

  const pin = resolvePin(options);
  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      "Flipkart Minutes needs a 6-digit pincode in the delivery area."
    );
  }

  try {
    await ensureLocation(lat, lng, pin, options);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/impit|reqwest|native bindings|Chrome TLS|fetch failed|ECONNRESET|network/i.test(msg)) {
      throw new Error(
        "Flipkart Minutes could not load on this server (TLS/network). Keep the home Impit tunnel running."
      );
    }
    throw err;
  }

  const pageUri =
    `/search?q=${encodeURIComponent(q)}` +
    `&marketplace=HYPERLOCAL&pincode=${pin}`;

  let data;
  let text;
  try {
    ({ data, text } = await romePost("/api/4/page/fetch?cacheFirst=false", {
      pageUri,
      pageContext: {
        trackingContext: {
          context: { eVar51: "direct_browse", eVar61: "direct_browse" },
        },
        fetchSeoData: true,
        networkSpeed: 10000,
      },
      requestContext: { type: "BROWSE_PAGE" },
      locationContext: {
        pincode: Number(pin),
        latitude: Number(lat),
        longitude: Number(lng),
        changed: false,
      },
    }));
  } catch (err) {
    const msg = String(err?.message || err);
    if (/impit|reqwest|native bindings|Chrome TLS/i.test(msg)) {
      throw new Error(
        "Flipkart Minutes could not load on this server (TLS/network). Set BLINKIT_PROXY_URL to the home Impit tunnel."
      );
    }
    // Location session may have expired — reset and retry once.
    session.locationKey = "";
    await ensureLocation(lat, lng, pin, options);
    ({ data, text } = await romePost("/api/4/page/fetch?cacheFirst=false", {
      pageUri,
      pageContext: {
        trackingContext: {
          context: { eVar51: "direct_browse", eVar61: "direct_browse" },
        },
        fetchSeoData: true,
        networkSpeed: 10000,
      },
      requestContext: { type: "BROWSE_PAGE" },
      locationContext: {
        pincode: Number(pin),
        latitude: Number(lat),
        longitude: Number(lng),
        changed: false,
      },
    }));
  }

  const redirect =
    data?.RESPONSE?.pageMeta?.redirectionObject?.url ||
    data?.RESPONSE?.pageMeta?.redirectionObject?.redirectionAction?.url;

  if (redirect && /hyperlocal-preview/i.test(redirect)) {
    // Force a fresh location bind, then retry search once.
    session.locationKey = "";
    await ensureLocation(lat, lng, pin, options);
    ({ data, text } = await romePost("/api/4/page/fetch?cacheFirst=false", {
      pageUri,
      pageContext: {
        trackingContext: {
          context: { eVar51: "direct_browse", eVar61: "direct_browse" },
        },
        fetchSeoData: true,
        networkSpeed: 10000,
      },
      requestContext: { type: "BROWSE_PAGE" },
      locationContext: {
        pincode: Number(pin),
        latitude: Number(lat),
        longitude: Number(lng),
        changed: false,
      },
    }));
  }

  if (/temporary hold on new orders/i.test(text || "")) {
    throw new Error(
      "Flipkart has a temporary hold on orders for this pincode."
    );
  }

  const out = [];
  const seen = new Set();
  mapNode(data?.RESPONSE || data, q, out, seen);

  if (!out.length) {
    const stillPreview =
      data?.RESPONSE?.pageMeta?.redirectionObject?.url ||
      data?.RESPONSE?.pageMeta?.redirectionObject?.redirectionAction?.url;
    if (stillPreview && /hyperlocal-preview/i.test(String(stillPreview))) {
      throw new Error(
        "Flipkart Minutes still needs a delivery pin. Try another nearby area."
      );
    }
    if (/"serviceable"\s*:\s*false/i.test(text || "")) {
      throw new Error(
        "Flipkart Minutes is not serviceable at this pincode yet."
      );
    }
    throw new Error("Flipkart Minutes returned no products for this search.");
  }

  return out.slice(0, 24);
}
