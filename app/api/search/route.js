import { NextResponse } from "next/server";
import { searchAll } from "@/lib/platforms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const label = sp.get("label")?.trim() || "";
  const city = sp.get("city")?.trim() || "";
  const postalCode = sp.get("postalCode")?.trim() || "";
  const locality = sp.get("locality")?.trim() || "";

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const results = await searchAll(q, lat, lng, {
    label,
    address: { city, postalCode, locality },
  });
  return NextResponse.json({ query: q, lat, lng, results });
}
