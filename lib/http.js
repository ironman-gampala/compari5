import { fetch as undiciFetch, ProxyAgent } from "undici";
import { residentialProxyUrl } from "./outbound-proxy.js";

let impitClient = null;
let impitProxy = null;
let useUndici = false;
let undiciDispatcher = null;
let undiciProxy = null;

function getUndiciDispatcher() {
  const proxy = residentialProxyUrl();
  if (!proxy) return undefined;
  if (!undiciDispatcher || undiciProxy !== proxy) {
    undiciDispatcher = new ProxyAgent(proxy);
    undiciProxy = proxy;
  }
  return undiciDispatcher;
}

async function getImpit() {
  if (useUndici) return null;
  const proxy = residentialProxyUrl() || null;
  if (impitClient && impitProxy === proxy) return impitClient;
  try {
    const { Impit } = await import("impit");
    impitClient = new Impit({
      browser: "chrome",
      ...(proxy ? { proxyUrl: proxy } : {}),
    });
    impitProxy = proxy;
    return impitClient;
  } catch (err) {
    useUndici = true;
    console.warn(
      "impit unavailable, falling back to undici:",
      err?.message || err
    );
    return null;
  }
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
  const client = await getImpit();
  if (client) {
    try {
      return await client.fetch(url, options);
    } catch (err) {
      const msg = String(err?.message || err);
      if (
        /impit|native bindings|reqwest|error sending request|tls|connection reset|timed out|connect/i.test(
          msg
        )
      ) {
        useUndici = true;
        impitClient = null;
        console.warn("impit fetch failed, falling back to undici:", msg);
        const dispatcher = getUndiciDispatcher();
        return undiciFetch(url, {
          ...options,
          ...(dispatcher ? { dispatcher } : {}),
        });
      }
      throw err;
    }
  }
  const dispatcher = getUndiciDispatcher();
  return undiciFetch(url, {
    ...options,
    ...(dispatcher ? { dispatcher } : {}),
  });
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
