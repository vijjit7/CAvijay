// Address → coordinates via the Google Maps Geocoding API, plus a distance helper.
//
// Associate case addresses are area-level ("...nagar", a locality name) rather than a
// precise house number, so geocoding resolves to roughly the right area — which is the
// granularity we want for a "~X km away" hint in the new-work push notification.
//
// Configuration is via GOOGLE_MAPS_API_KEY. When unset, geocodeAddress() is a safe
// no-op that returns null, so the push code simply omits the distance line and MIS
// writes are never affected.

const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "";

export function isGeocodingConfigured(): boolean {
  return !!apiKey;
}

export interface LatLng {
  lat: number;
  lng: number;
}

// Cache resolved addresses for the lifetime of the process. Case addresses repeat
// across co-applicants and re-assignments, and the same push may be fanned out to
// several devices, so this avoids hammering the Geocoding API. `null` caches a
// confirmed "no result / error" so we don't retry a bad address on every push.
const cache = new Map<string, LatLng | null>();

function normalizeKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Turn a case address into the queries we'll try against the Geocoding API, best first.
 *
 * Case addresses are "house no, area, city". A house number is exactly what Google most
 * often can't resolve (→ ZERO_RESULTS, so no distance line), while the AREA is both
 * reliably geocodable and the right granularity for a "~X km away" hint. So we try the
 * area (with its city for disambiguation) first, then fall back to the full address,
 * then to the city alone.
 */
function addressCandidates(raw: string): string[] {
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  // Area + city: drop the leading house-number segment when the address has the full
  // three-part shape. This is the query the distance hint really wants.
  if (segments.length >= 3) {
    candidates.push(segments.slice(1).join(", "));
  }
  // Full address exactly as entered.
  candidates.push(raw);
  // Last-ditch: the city / final segment on its own.
  if (segments.length >= 2) {
    candidates.push(segments[segments.length - 1]);
  }
  // De-dupe, preserving order.
  return Array.from(new Set(candidates));
}

// Geocode one concrete query string. Caches the result (including a confirmed miss) so
// repeated pushes / overlapping candidates never re-hit the API for the same text.
async function geocodeOnce(query: string): Promise<LatLng | null> {
  const key = normalizeKey(query);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(query)}` +
      "&region=in&components=country:IN" +
      `&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[Geocode] HTTP", res.status, "for:", query);
      cache.set(key, null);
      return null;
    }
    const data: any = await res.json();
    if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
      const loc = data.results[0].geometry.location;
      const result = { lat: loc.lat as number, lng: loc.lng as number };
      cache.set(key, result);
      return result;
    }
    // ZERO_RESULTS is an expected outcome for a vague query; log anything else, since
    // REQUEST_DENIED / OVER_QUERY_LIMIT point at a config/billing problem to fix.
    if (data.status !== "ZERO_RESULTS") {
      console.error("[Geocode] status", data.status, data.error_message || "", "for:", query);
    }
    cache.set(key, null);
    return null;
  } catch (err) {
    console.error("[Geocode] request failed:", err);
    cache.set(key, null);
    return null;
  }
}

/**
 * Geocode a case address to coordinates, biased to India (region=in,
 * components=country:IN). Tries the area-focused query first (see addressCandidates),
 * then the full address, then the city. Returns null when geocoding is unconfigured, the
 * address is blank, or nothing resolves — callers must treat null as "distance
 * unavailable", never an error.
 */
export async function geocodeAddress(address: string | null | undefined): Promise<LatLng | null> {
  if (!apiKey) return null;
  const raw = (address || "").trim();
  if (!raw) return null;

  const key = normalizeKey(raw);
  if (cache.has(key)) return cache.get(key)!;

  for (const candidate of addressCandidates(raw)) {
    const loc = await geocodeOnce(candidate);
    if (loc) {
      cache.set(key, loc);
      return loc;
    }
  }

  cache.set(key, null);
  return null;
}

// Great-circle distance between two points in kilometres (haversine).
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth radius, km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Human-friendly distance string: "~450 m away" under 1 km, "~3.2 km away" under
// 10 km, "~12 km away" beyond. Kept compact so it fits a notification body line.
export function formatDistance(km: number): string {
  if (km < 1) return `~${Math.round(km * 1000)} m away`;
  if (km < 10) return `~${km.toFixed(1)} km away`;
  return `~${Math.round(km)} km away`;
}
