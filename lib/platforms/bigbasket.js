import { fetchJson, parseRupee } from "../http.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * www.bigbasket.com/listing-svc is now Akamai-blocked (even for real Chrome).
 * bbnow.bigbasket.com still serves the same listing API.
 */
const BASES = [
  "https://bbnow.bigbasket.com",
  "https://www.bigbasket.com",
];

let session = null;

function cookieValue(cookies, name) {
  const row = (cookies || []).find((c) => c.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : "";
}

async function ensureSession(base) {
  if (session?.cookies && session?.base === base) return session;
  const { setCookie, status } = await fetchJson(`${base}/`, {
    headers: { "user-agent": UA, accept: "text/html" },
  });
  if (status >= 500) {
    throw new Error(`BigBasket homepage failed (${status})`);
  }
  const cookies = (setCookie || []).map((c) => c.split(";")[0]);
  const entryContext =
    cookieValue(cookies, "xentrycontext") ||
    cookieValue(cookies, "x-entry-context") ||
    "bbnow";
  const entryContextId =
    cookieValue(cookies, "xentrycontextid") ||
    cookieValue(cookies, "_bb_cid") ||
    "10";
  const channel = cookieValue(cookies, "x-channel") || "BB-WEB";
  session = {
    base,
    cookies: cookies.join("; "),
    entryContext,
    entryContextId,
    channel,
  };
  return session;
}

function midFromPin(postalCode, city, fallback) {
  const pin = String(postalCode || "").slice(0, 6);
  if (fallback) return fallback;
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

  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const pin =
    options.address?.postalCode ||
    String(options.label || "").match(/\b(\d{6})\b/)?.[1] ||
    "560001";

  let lastStatus = 0;
  let lastMsg = "";

  for (const base of BASES) {
    let sess;
    try {
      sess = await ensureSession(base);
    } catch (err) {
      lastMsg = err?.message || String(err);
      session = null;
      continue;
    }

    const cityMid = midFromPin(pin, options.address?.city || options.label);
    const contexts = [
      {
        channel: "BB-WEB",
        entryContext: "bbnow",
        entryContextId: "10",
        bucketId: "65",
      },
      {
        channel: sess.channel || "BB-WEB",
        entryContext: sess.entryContext || "bbnow",
        entryContextId: String(sess.entryContextId || "10"),
        bucketId: "65",
      },
      {
        channel: "BB-WEB",
        entryContext: "bb-b2c",
        entryContextId: cityMid,
        bucketId: null,
      },
    ];

    for (const ctx of contexts) {
      const params = new URLSearchParams({
        type: "ps",
        slug: q,
        page: "1",
      });
      if (ctx.bucketId) params.set("bucket_id", ctx.bucketId);

      const url = `${base}/listing-svc/v2/products?${params}`;
      const { ok, status, data, text } = await fetchJson(url, {
        headers: {
          "user-agent": UA,
          accept: "application/json, text/plain, */*",
          referer: `${base}/ps/?q=${encodeURIComponent(q)}`,
          origin: base,
          "x-channel": ctx.channel,
          "x-entry-context": ctx.entryContext,
          "x-entry-context-id": String(ctx.entryContextId),
          "x-tracker": crypto.randomUUID(),
          cookie: [
            sess.cookies,
            `_bb_lat=${lat}`,
            `_bb_lon=${lng}`,
            `_bb_lat_long=${lat}|${lng}`,
            `_bb_pin_code=${pin}`,
            `_bb_cid=${ctx.entryContextId}`,
          ]
            .filter(Boolean)
            .join("; "),
        },
      });

      lastStatus = status;
      if (/Access Denied/i.test(String(text || ""))) {
        lastMsg = "BigBasket blocked this server (Akamai 403).";
        continue;
      }

      if (!ok || data?.errors) {
        lastMsg =
          data?.errors?.[0]?.display_msg ||
          data?.errors?.[0]?.msg ||
          `BigBasket search failed (${status})`;
        if (status === 400 || status === 401 || status === 403) {
          session = null;
        }
        continue;
      }

      const products = mapProducts(data, q);
      if (products.length) return products;
      lastMsg = "BigBasket returned no products for this search.";
    }
  }

  if (/403|Akamai/i.test(lastMsg) || lastStatus === 403) {
    throw new Error(
      "BigBasket is blocking product search from this network right now (Akamai). Try again later from another network, or compare the other stores."
    );
  }
  throw new Error(lastMsg || `BigBasket search failed (${lastStatus})`);
}
