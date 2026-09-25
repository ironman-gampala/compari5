import { readJsonAsync, writeJsonAsync } from "./auth/store.js";
import { homeProxyEnabled } from "./outbound-proxy.js";

const BLOB_KEY = "blinkit-proxy-url";
const CACHE_MS = 15_000;

let cache = { url: "", at: 0 };

function envProxyUrl() {
  return String(process.env.BLINKIT_PROXY_URL || "")
    .trim()
    .replace(/\/$/, "");
}

export function proxySecret() {
  return String(process.env.BLINKIT_PROXY_SECRET || "").trim();
}

/**
 * Optional home Impit tunnel URL (personal machine / Pi only).
 * Disabled unless ENABLE_HOME_PROXY=1 — do not use from a work laptop.
 */
export async function getProxyBaseUrl() {
  if (!homeProxyEnabled()) return "";

  const now = Date.now();
  if (cache.url && now - cache.at < CACHE_MS) return cache.url;

  let fromBlob = "";
  try {
    const row = await readJsonAsync(BLOB_KEY);
    fromBlob = String(row?.url || "")
      .trim()
      .replace(/\/$/, "");
  } catch {
    // ignore
  }

  const url = fromBlob || envProxyUrl();
  cache = { url, at: now };
  return url;
}

export async function proxyConfigured() {
  return Boolean(await getProxyBaseUrl());
}

export async function setProxyBaseUrl(url) {
  if (!homeProxyEnabled()) {
    throw new Error(
      "Home proxy registration is disabled. Set ENABLE_HOME_PROXY=1 only on a personal machine, or use RESIDENTIAL_PROXY_URL."
    );
  }
  const cleaned = String(url || "")
    .trim()
    .replace(/\/$/, "");
  if (!/^https?:\/\//i.test(cleaned)) {
    throw new Error("url must be an http(s) absolute URL");
  }
  await writeJsonAsync(BLOB_KEY, {
    url: cleaned,
    updatedAt: new Date().toISOString(),
  });
  cache = { url: cleaned, at: Date.now() };
  return cleaned;
}

export function clearProxyUrlCache() {
  cache = { url: "", at: 0 };
}
