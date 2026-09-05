let clientPromise;

async function getHttp() {
  if (!clientPromise) {
    clientPromise = import("impit").then(({ Impit }) => new Impit({ browser: "chrome" }));
  }
  return clientPromise;
}

export async function fetchJson(url, options = {}) {
  const client = await getHttp();
  const res = await client.fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, text };
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
