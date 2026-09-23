/**
 * Resolve a 6-digit Indian pincode from place fields and/or lat/lng.
 * Google Places often omits postal_code for localities (Koramangala, HSR, …).
 */

export function extractIndianPin(...texts) {
  for (const t of texts) {
    const m = String(t || "").match(/\b([1-9]\d{5})\b/);
    if (m) return m[1];
  }
  return "";
}

function googleKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

async function googleReversePin(lat, lng, key) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    new URLSearchParams({
      latlng: `${lat},${lng}`,
      language: "en",
      result_type: "postal_code",
      key,
    });
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    // Broader reverse without result_type filter
    const url2 =
      "https://maps.googleapis.com/maps/api/geocode/json?" +
      new URLSearchParams({
        latlng: `${lat},${lng}`,
        language: "en",
        key,
      });
    const res2 = await fetch(url2, { cache: "no-store" });
    const data2 = await res2.json();
    return pinFromGeocodeResults(data2?.results);
  }
  return pinFromGeocodeResults(data?.results);
}

function pinFromGeocodeResults(results) {
  if (!Array.isArray(results)) return "";
  for (const r of results) {
    const fromLabel = extractIndianPin(r.formatted_address);
    if (fromLabel) return fromLabel;
    const comp = (r.address_components || []).find((c) =>
      (c.types || []).includes("postal_code")
    );
    const pin = String(comp?.long_name || comp?.short_name || "").replace(
      /\D/g,
      ""
    );
    if (/^[1-9]\d{5}$/.test(pin)) return pin;
  }
  return "";
}

async function nominatimReversePin(lat, lng) {
  const url =
    "https://nominatim.openstreetmap.org/reverse?" +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "18",
    });
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Compari5/1.0 (personal price compare)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const data = await res.json();
  return (
    extractIndianPin(data?.address?.postcode, data?.display_name) || ""
  );
}

/**
 * @param {{ lat?: number, lng?: number, postalCode?: string, label?: string }} place
 * @returns {Promise<string>} 6-digit pin or ""
 */
export async function resolveIndianPin(place = {}) {
  const existing = String(place.postalCode || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (/^[1-9]\d{5}$/.test(existing)) return existing;

  const fromLabel = extractIndianPin(place.label);
  if (fromLabel) return fromLabel;

  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";

  const key = googleKey();
  if (key) {
    try {
      const pin = await googleReversePin(lat, lng, key);
      if (pin) return pin;
    } catch {
      // fall through
    }
  }

  try {
    return (await nominatimReversePin(lat, lng)) || "";
  } catch {
    return "";
  }
}

/** Mutates/returns place with postalCode filled when possible. */
export async function withPostalCode(place) {
  if (!place || typeof place !== "object") return place;
  const pin = await resolveIndianPin(place);
  if (!pin) return place;
  if (place.postalCode === pin) return place;
  return { ...place, postalCode: pin };
}
