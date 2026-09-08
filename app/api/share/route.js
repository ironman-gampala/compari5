import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { readJsonAsync, writeJsonAsync } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortId() {
  return randomBytes(5).toString("base64url"); // ~8 chars
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  if (items.length > 80) {
    return NextResponse.json({ error: "too many items" }, { status: 400 });
  }

  const id = shortId();
  const payload = {
    v: 1,
    createdAt: Date.now(),
    location: body.location || null,
    items: items.map((i) => ({
      key: i.key,
      platform: i.platform,
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      mrp: i.mrp,
      url: i.url,
      image: i.image,
      eta: i.eta,
      query: i.query,
      qty: i.qty || 1,
    })),
  };

  await writeJsonAsync(`share-${id}`, payload);
  return NextResponse.json({ id, urlPath: `/?b=${id}` });
}

export async function GET(request) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id || !/^[A-Za-z0-9_-]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const payload = await readJsonAsync(`share-${id}`, null);
  if (!payload?.items?.length) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
