import { NextResponse } from "next/server";
import { authStatus, disconnectProvider } from "@/lib/auth/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await authStatus());
}

export async function DELETE(request) {
  const provider = request.nextUrl.searchParams.get("provider");
  if (!provider || !["swiggy", "zepto"].includes(provider)) {
    return NextResponse.json(
      { error: "provider=swiggy|zepto required" },
      { status: 400 }
    );
  }
  await disconnectProvider(provider);
  return NextResponse.json({ ok: true, ...(await authStatus()) });
}
