import { randomUUID } from "crypto";
import { fetchJson, parseRupee, withTimeout } from "../http.js";
import {
  isCloudRuntime,
  residentialProxyUrl,
} from "../outbound-proxy.js";
import {
  getProxyBaseUrl,
  proxyConfigured,
  proxySecret,
} from "../proxy-url.js";

const REQ_KEY = "c0e6868e-1180-400c-be51-f473479f1f0a";

const CLOUD_UNAVAILABLE =
  "Blinkit is not available on the live cloud site without a residential proxy (RESIDENTIAL_PROXY_URL). It works with npm run dev on your own machine.";

let session = {
  authKey: null,
  deviceId: randomUUID().replace(/-/g, "").slice(0, 16),
  sessionUuid: randomUUID(),
};

async function searchViaProxy(query, lat, lng) {
  const base = await getProxyBaseUrl();
  if (!base) throw new Error("Blinkit proxy URL is not configured.");
  const secret = proxySecret();
  const url =
    `${base}/search?` +
    new URLSearchParams({
      q: query,
      lat: String(lat),
      lng: String(lng),
    });

  const { ok, status, data } = await withTimeout(
    fetchJson(url, {
      headers: {
        accept: "application/json",
        "bypass-tunnel-reminder": "true",
        ...(secret ? { "x-compari5-proxy-secret": secret } : {}),
      },
    }),
    25000,
    "blinkit-proxy"
  );

  if (!ok) {
    const err = data?.error || `Blinkit proxy failed (${status || "error"})`;
    if (/403|auth_key failed/i.test(err)) {
      throw new Error(
        "Blinkit blocked this request. Use a residential proxy (RESIDENTIAL_PROXY_URL) or run locally."
      );
    }
    throw new Error(err);
  }

  const products = Array.isArray(data?.products) ? data.products : [];
  if (!products.length) {
    throw new Error("Blinkit returned no products for this search.");
  }
  return products.slice(0, 24);
}

async function ensureAuthKey() {
  if (session.authKey) return session.authKey;
  const { ok, status, data } = await fetchJson(
    "https://blinkit.com/v2/accounts/auth_key/",
    {
      headers: {
        req_key: REQ_KEY,
        app_client: "consumer_web",
        platform: "desktop_web",
        device_id: session.deviceId,
        session_uuid: session.sessionUuid,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "application/json, text/plain, */*",
        origin: "https://blinkit.com",
        referer: "https://blinkit.com/",
      },
    }
  );
  if (!ok || !data?.auth_key) {
    if (status === 403) {
      throw new Error(
        "Blinkit blocked this server IP. Set RESIDENTIAL_PROXY_URL to a residential HTTP proxy, or run Compari5 locally."
      );
    }
    throw new Error(`Blinkit auth_key failed (${status || "error"})`);
  }
  session.authKey = data.auth_key;
  return session.authKey;
}

function headers(lat, lng) {
  return {
    auth_key: session.authKey,
    app_client: "consumer_web",
    platform: "desktop_web",
    device_id: session.deviceId,
    session_uuid: session.sessionUuid,
    lat: String(lat),
    lon: String(lng),
    app_version: "52434332",
    web_app_version: "1008010016",
    rn_bundle_version: "1009003012",
    "content-type": "application/json",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    accept: "application/json, text/plain, */*",
    origin: "https://blinkit.com",
    referer: "https://blinkit.com/",
  };
}

function walkProducts(node, out) {
  if (!node || typeof node !== "object") return;
  const cart = node?.atc_action?.add_to_cart?.cart_item;
  if (cart?.product_id && cart?.product_name) {
    const price = parseRupee(cart.price ?? cart.normal_price);
    const mrp = parseRupee(cart.mrp);
    out.push({
      id: String(cart.product_id),
      name: cart.display_name || cart.product_name,
      brand: cart.brand || "",
      quantity: cart.unit || "",
      mrp,
      price: price ?? mrp,
      image: cart.image_url || cart.image || "",
      eta: cart.eta_identifier || "",
      url: `https://blinkit.com/prn/product/prid/${cart.product_id}`,
      platform: "blinkit",
    });
  }
  if (node?.identity?.id && node?.name?.text && node?.normal_price?.text) {
    const id = String(node.identity.id);
    if (!out.some((p) => p.id === id)) {
      out.push({
        id,
        name: node.name.text,
        brand: "",
        quantity: node.variant?.text || "",
        mrp: parseRupee(node.mrp?.text),
        price: parseRupee(node.normal_price?.text),
        image: node.image?.url || "",
        eta: node.eta_tag?.title?.text || "",
        url: `https://blinkit.com/prn/product/prid/${id}`,
        platform: "blinkit",
      });
    }
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((x) => walkProducts(x, out));
    else if (v && typeof v === "object") walkProducts(v, out);
  }
}

async function searchDirect(query, lat, lng) {
  await ensureAuthKey();
  const q = encodeURIComponent(query);
  const { ok, status, data } = await withTimeout(
    fetchJson(
      `https://blinkit.com/v1/layout/search?q=${q}&search_type=type_to_search`,
      {
        method: "POST",
        headers: headers(lat, lng),
        body: JSON.stringify({
          applied_filters: null,
          sort: null,
          postback_meta: {},
          previous_search_query: "",
          vertical_cards_processed: 0,
        }),
      }
    ),
    12000,
    "blinkit"
  );
  if (!ok) throw new Error(`Blinkit HTTP ${status}`);
  const products = [];
  walkProducts(data, products);
  const seen = new Set();
  return products
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return p.price != null;
    })
    .slice(0, 24);
}

export async function searchBlinkit(query, lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("Blinkit needs a valid delivery area pin first.");
  }
  // Optional personal home tunnel (ENABLE_HOME_PROXY=1) — not for work laptops.
  if (await proxyConfigured()) {
    return searchViaProxy(query, lat, lng);
  }
  // Cloud without residential egress → skip noisy 403s.
  if (isCloudRuntime() && !residentialProxyUrl()) {
    throw new Error(CLOUD_UNAVAILABLE);
  }
  return searchDirect(query, lat, lng);
}
