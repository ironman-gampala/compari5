import { createServer } from "http";
import { randomUUID } from "crypto";
import { Impit } from "impit";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.BLINKIT_PROXY_SECRET || "";
const REQ_KEY = "c0e6868e-1180-400c-be51-f473479f1f0a";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const session = {
  authKey: null,
  deviceId: randomUUID().replace(/-/g, "").slice(0, 16),
  sessionUuid: randomUUID(),
};

const impit = new Impit({ browser: "chrome" });

function parseRupee(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res) {
  json(res, 401, { error: "unauthorized" });
}

function requireSecret(req, res) {
  if (!SECRET) return true;
  const got = req.headers["x-compari5-proxy-secret"];
  if (got && got === SECRET) return true;
  unauthorized(res);
  return false;
}

async function ensureAuthKey() {
  if (session.authKey) return session.authKey;
  const res = await impit.fetch("https://blinkit.com/v2/accounts/auth_key/", {
    headers: {
      req_key: REQ_KEY,
      app_client: "consumer_web",
      platform: "desktop_web",
      device_id: session.deviceId,
      session_uuid: session.sessionUuid,
      "user-agent": UA,
      accept: "application/json, text/plain, */*",
      origin: "https://blinkit.com",
      referer: "https://blinkit.com/",
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || !data?.auth_key) {
    throw new Error(`Blinkit auth_key failed (${res.status})`);
  }
  session.authKey = data.auth_key;
  return session.authKey;
}

function searchHeaders(lat, lng) {
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
    "user-agent": UA,
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

async function searchBlinkit(query, lat, lng) {
  await ensureAuthKey();
  const q = encodeURIComponent(query);
  const res = await impit.fetch(
    `https://blinkit.com/v1/layout/search?q=${q}&search_type=type_to_search`,
    {
      method: "POST",
      headers: searchHeaders(lat, lng),
      body: JSON.stringify({
        applied_filters: null,
        sort: null,
        postback_meta: {},
        previous_search_query: "",
        vertical_cards_processed: 0,
      }),
    }
  );
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(`Blinkit HTTP ${res.status}`);
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

function readUrl(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
}

const server = createServer(async (req, res) => {
  try {
    const url = readUrl(req);
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, service: "compari5-blinkit-proxy" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/search") {
      if (!requireSecret(req, res)) return;
      const q = (url.searchParams.get("q") || "").trim();
      const lat = Number(url.searchParams.get("lat"));
      const lng = Number(url.searchParams.get("lng"));
      if (q.length < 2) {
        json(res, 400, { error: "q required" });
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        json(res, 400, { error: "lat/lng required" });
        return;
      }
      const products = await searchBlinkit(q, lat, lng);
      json(res, 200, { products });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    json(res, 502, { error: err?.message || "blinkit proxy failed" });
  }
});

server.listen(PORT, () => {
  console.log(`blinkit-proxy listening on :${PORT}`);
});
