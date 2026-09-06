import { fetchJson, parseRupee } from "../http.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let sessionCookies = "";

async function ensureSession() {
  if (sessionCookies) return sessionCookies;
  const { setCookie } = await fetchJson("https://www.bigbasket.com/", {
    headers: { "user-agent": UA, accept: "text/html" },
  });
  sessionCookies = (setCookie || []).map((c) => c.split(";")[0]).join("; ");
  return sessionCookies;
}

function midFromPin(postalCode, city) {
  const pin = String(postalCode || "").slice(0, 6);
  if (/^560/.test(pin) || /bengaluru|bangalore/i.test(city || "")) return "100";
  if (/^400|^401/.test(pin) || /mumbai/i.test(city || "")) return "3";
  if (
    /^110|^122|^201/.test(pin) ||
    /delhi|gurgaon|gurugram|noida/i.test(city || "")
  )
    return "4";
  if (/^500/.test(pin) || /hyderabad/i.test(city || "")) return "12";
  if (/^600/.test(pin) || /chennai/i.test(city || "")) return "5";
  if (/^411|^412/.test(pin) || /pune/i.test(city || "")) return "2";
  return "100";
}

function mapProducts(payload, query) {
  const products = payload?.tabs?.[0]?.product_info?.products || [];
  const list = Array.isArray(products) ? products : [];
  const out = [];

  for (const p of list) {
    const id = String(p.id || p.sku || p.requested_sku_id || "");
    const brand = p.brand?.name || p.brand || "";
    const name = [brand, p.desc || p.name || p.product_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const price = parseRupee(
      p.pricing?.discount?.prim_price?.sp ??
        p.pricing?.discount?.prim_price?.rsp ??
        p.pricing?.discount?.mrp
    );
    const mrp = parseRupee(p.pricing?.discount?.mrp ?? price);
    if (!id || !name || price == null) continue;

    const img =
      p.images?.[0]?.m ||
      p.images?.[0]?.s ||
      p.img_url ||
      p.image ||
      "";

    out.push({
      id,
      name,
      brand: String(brand),
      quantity:
        p.w ||
        p.pack_desc ||
        (p.magnitude ? `${p.magnitude} ${p.unit || ""}`.trim() : ""),
      mrp,
      price,
      image: img,
      eta: p.availability?.show_express ? "Express" : "",
      url: p.absolute_url
        ? `https://www.bigbasket.com${p.absolute_url}`
        : `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
      platform: "bigbasket",
    });
  }

  return out.slice(0, 24);
}

export async function searchBigbasket(query, lat, lng, options = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("BigBasket needs a valid delivery area pin first.");
  }

  const cookies = await ensureSession();
  const pin =
    options.address?.postalCode ||
    String(options.label || "").match(/\b(\d{6})\b/)?.[1] ||
    "560001";
  const mid = midFromPin(pin, options.address?.city || options.label);

  const url =
    "https://www.bigbasket.com/listing-svc/v2/products?" +
    new URLSearchParams({
      type: "ps",
      slug: query,
      page: "1",
    });

  const { ok, status, data } = await fetchJson(url, {
    headers: {
      "user-agent": UA,
      accept: "application/json",
      referer: `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
      origin: "https://www.bigbasket.com",
      "x-channel": "BB-WEB",
      "x-entry-context": "bb-b2c",
      "x-entry-context-id": mid,
      "x-tracker": crypto.randomUUID(),
      cookie: [
        cookies,
        `_bb_lat=${lat}`,
        `_bb_lon=${lng}`,
        `_bb_lat_long=${lat}|${lng}`,
        `_bb_pin_code=${pin}`,
        `_bb_cid=${mid}`,
      ]
        .filter(Boolean)
        .join("; "),
    },
  });

  if (!ok || data?.errors) {
    const msg =
      data?.errors?.[0]?.display_msg ||
      data?.errors?.[0]?.msg ||
      `BigBasket search failed (${status})`;
    throw new Error(msg);
  }

  const products = mapProducts(data, query);
  if (!products.length) {
    throw new Error("BigBasket returned no products for this search.");
  }
  return products;
}
