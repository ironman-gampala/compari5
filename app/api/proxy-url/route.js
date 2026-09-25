import { NextResponse } from "next/server";
import {
  getProxyBaseUrl,
  proxySecret,
  setProxyBaseUrl,
} from "@/lib/proxy-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request) {
  const expected = proxySecret();
  if (!expected) return false;
  const got =
    request.headers.get("x-compari5-proxy-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  return got === expected;
}

/** Home watchdog registers the current public tunnel URL (no redeploy needed). */
export async function PUT(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const url = await setProxyBaseUrl(body?.url);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  return PUT(request);
}

/** Optional: see which proxy URL the live site will use (secret required). */
export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = await getProxyBaseUrl();
  return NextResponse.json({
    ok: true,
    url: url || null,
    source: url ? "blob-or-env" : "none",
  });
}
