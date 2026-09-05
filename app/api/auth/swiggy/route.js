import { NextResponse } from "next/server";
import { startOAuth } from "@/lib/auth/mcp";
import { getBaseUrl } from "@/lib/auth/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const base = getBaseUrl(request);
  try {
    const result = await startOAuth("swiggy", request);
    if (result.status === "authorized") {
      return NextResponse.redirect(new URL("/?connected=swiggy", base));
    }
    return NextResponse.redirect(result.url);
  } catch (err) {
    const msg = encodeURIComponent(err?.message || "Swiggy auth failed");
    return NextResponse.redirect(new URL(`/?auth_error=${msg}`, base));
  }
}
