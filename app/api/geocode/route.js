import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getGoogleKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

async function googlePlacesNewSearch(query, key) {
  const autoRes = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["in"],
        languageCode: "en",
      }),
      cache: "no-store",
    }
  );

  const autoData = await autoRes.json();
  if (!autoRes.ok) {
    const msg =
      autoData?.error?.message ||
      autoData?.error_message ||
      JSON.stringify(autoData).slice(0, 200);
    throw new Error(`Places Autocomplete failed: ${msg}`);
  }

  const suggestions = (autoData.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 6);

  if (!suggestions.length) {
    return googleGeocode(query, key);
  }

  const places = await Promise.all(
    suggestions.map(async (s) => {
      const placeId = s.placeId;
      if (!placeId) return null;
      const id = placeId.replace(/^places\//, "");
      const detRes = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
        {
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location,addressComponents",
          },
          cache: "no-store",
        }
      );
      const det = await detRes.json();
      if (!detRes.ok || !det?.location) {
        // Fall back to text only via geocode of prediction text
        const text =
          s.text?.text ||
          [
            s.structuredFormat?.mainText?.text,
            s.structuredFormat?.secondaryText?.text,
          ]
            .filter(Boolean)
            .join(", ");
        if (!text) return null;
        const geo = await googleGeocode(text, key);
        return geo[0]
          ? { ...geo[0], label: text, placeId: id }
          : null;
      }
      const parts = parseAddressComponents(det.addressComponents);
      return {
        label:
          det.formattedAddress ||
          det.displayName?.text ||
          s.text?.text ||
          query,
        lat: Number(det.location.latitude),
        lng: Number(det.location.longitude),
        placeId: id,
        source: "google",
        ...parts,
      };
    })
  );

  return places.filter(Boolean);
}

async function googleGeocode(query, key) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    new URLSearchParams({
      address: query,
      components: "country:IN",
      language: "en",
      region: "in",
      key,
    });

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.status === "REQUEST_DENIED") {
    throw new Error(
      data.error_message ||
        "Geocoding API denied. Enable Geocoding API for this key."
    );
  }
  if (data.status === "OVER_QUERY_LIMIT") {
    throw new Error("Google Maps quota exceeded. Try again later.");
  }

  return (data.results || []).slice(0, 6).map((r) => {
    const parts = parseGeocodeComponents(r.address_components);
    return {
      label: r.formatted_address,
      lat: Number(r.geometry.location.lat),
      lng: Number(r.geometry.location.lng),
      placeId: r.place_id,
      source: "google",
      ...parts,
    };
  });
}

function parseAddressComponents(components) {
  if (!Array.isArray(components)) return {};
  const get = (...types) => {
    const row = components.find((c) =>
      (c.types || []).some((t) => types.includes(t))
    );
    return row?.longText || row?.shortText || "";
  };
  return {
    locality:
      get("sublocality_level_1", "sublocality", "neighborhood") ||
      get("locality"),
    city: get("locality", "administrative_area_level_2"),
    postalCode: get("postal_code"),
  };
}

function parseGeocodeComponents(components) {
  if (!Array.isArray(components)) return {};
  const get = (...types) => {
    const row = components.find((c) =>
      (c.types || []).some((t) => types.includes(t))
    );
    return row?.long_name || row?.short_name || "";
  };
  return {
    locality:
      get("sublocality_level_1", "sublocality", "neighborhood") ||
      get("locality"),
    city: get("locality", "administrative_area_level_2"),
    postalCode: get("postal_code"),
  };
}

async function nominatimSearch(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: `${q}, India`,
      format: "json",
      addressdetails: "1",
      limit: "6",
      countrycodes: "in",
    });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Compari5/1.0 (personal price compare)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((p) => ({
    label: p.display_name,
    lat: Number(p.lat),
    lng: Number(p.lon),
    source: "nominatim",
  }));
}

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }

  const key = getGoogleKey();

  try {
    if (key) {
      let places = [];
      let used = "google";
      try {
        places = await googlePlacesNewSearch(q, key);
      } catch (placesErr) {
        // Places (New) may be off; Geocoding alone is often enough for areas
        places = await googleGeocode(q, key);
        used = "google-geocode";
        if (!places.length) {
          throw placesErr;
        }
      }

      if (places?.length) {
        return NextResponse.json({ places, provider: used });
      }
      return NextResponse.json({
        places: [],
        provider: used,
        warning: "No Google results for that area. Try a clearer locality name.",
      });
    }

    const places = await nominatimSearch(q);
    return NextResponse.json({
      places,
      provider: "nominatim",
      warning:
        "Using OpenStreetMap. Add GOOGLE_MAPS_API_KEY in .env.local for Google search.",
    });
  } catch (err) {
    try {
      const places = await nominatimSearch(q);
      return NextResponse.json({
        places,
        provider: "nominatim",
        warning: err?.message || "Google Maps error. Fell back to OpenStreetMap.",
      });
    } catch {
      return NextResponse.json(
        { error: err?.message || "Geocode failed" },
        { status: 502 }
      );
    }
  }
}
