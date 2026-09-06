import { fetch as undiciFetch } from "undici";

let clientPromise;
let useUndici = false;

async function getHttp() {
  if (useUndici) return null;
  if (!clientPromise) {
    clientPromise = import("impit")
      .then(({ Impit }) => new Impit({ browser: "chrome" }))
      .catch((err) => {
        useUndici = true;
        console.warn(
          "impit unavailable, falling back to undici:",
          err?.message || err
        );
        return null;
      });
  }
  return clientPromise;
}

function pickSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function doFetch(url, options) {
  const client = await getHttp();
  if (client) {
    try {
      return await client.fetch(url, options);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/impit|native bindings/i.test(msg)) {
        useUndici = true;
        clientPromise = null;
        console.warn("impit fetch failed, falling back to undici:", msg);
        return undiciFetch(url, options);
      }
      throw err;
    }
  }
  return undiciFetch(url, options);
}

export async function fetchJson(url, options = {}) {
  const res = await doFetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    text,
    headers: res.headers,
    setCookie: pickSetCookie(res.headers),
  };
}

export function withTimeout(promise, ms, label = "request") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

export function parseRupee(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
