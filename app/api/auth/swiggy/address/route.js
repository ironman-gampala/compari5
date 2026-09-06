import { NextResponse } from "next/server";
import {
  callMcpTool,
  setCachedAddressId,
  getCachedAddressId,
  authStatus,
} from "@/lib/auth/mcp";
import { readJsonAsync } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await authStatus();
    if (!status.swiggy) {
      return NextResponse.json(
        { error: "Swiggy not connected" },
        { status: 401 }
      );
    }
    const raw = await callMcpTool("swiggy", "get_addresses", {});
    const data = raw?.data || raw;
    const addresses = data?.addresses || data || [];
    const list = (Array.isArray(addresses) ? addresses : []).map((a) => ({
      id: a.id || a.addressId,
      label: a.addressTag || a.addressLine || a.fullAddress || "Saved address",
      line: a.addressLine || "",
      category: a.addressCategory || "",
    }));

    const cachedId = await getCachedAddressId();
    const active = list.find((a) => a.id === cachedId) || list[0] || null;
    if (active) await setCachedAddressId(active.id, active.label);

    const tokens = await readJsonAsync("oauth-swiggy-tokens");
    return NextResponse.json({
      addresses: list,
      active,
      syncedAt: tokens?.saved_at || Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load addresses" },
      { status: 502 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await setCachedAddressId(body.id, body.label || "Selected address");
    return NextResponse.json({
      ok: true,
      active: { id: body.id, label: body.label },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed" },
      { status: 500 }
    );
  }
}
