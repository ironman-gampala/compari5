import { NextResponse } from "next/server";
import { finishOAuth } from "@/lib/auth/mcp";
import { getBaseUrl } from "@/lib/auth/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const base = getBaseUrl(request);

  if (error) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(error)}`, base)
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", base));
  }

  try {
    await finishOAuth("swiggy", code, request);
    return NextResponse.redirect(new URL("/?connected=swiggy", base));
  } catch (err) {
    const msg = encodeURIComponent(err?.message || "token exchange failed");
    return NextResponse.redirect(new URL(`/?auth_error=${msg}`, base));
  }
}
