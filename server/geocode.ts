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
 * Geocode a free-text address to coordinates. Biased to India (region=in,
 * components=country:IN) since all case addresses are Indian localities. Returns null
 * when geocoding is unconfigured, the address is blank, nothing matches, or the request
 * fails — callers must treat null as "distance unavailable", never an error.
 */
export async function geocodeAddress(address: string | null | undefined): Promise<LatLng | null> {
  if (!apiKey) return null;
  const raw = (address || "").trim();
  if (!raw) return null;

  const key = normalizeKey(raw);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(raw)}` +
      "&region=in&components=country:IN" +
      `&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[Geocode] HTTP", res.status, "for address:", raw);
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
    // ZERO_RESULTS is an expected outcome for a vague address; log anything else, since
    // REQUEST_DENIED / OVER_QUERY_LIMIT point at a config/billing problem to fix.
    if (data.status !== "ZERO_RESULTS") {
      console.error("[Geocode] status", data.status, data.error_message || "", "for:", raw);
    }
    cache.set(key, null);
    return null;
  } catch (err) {
    console.error("[Geocode] request failed:", err);
    cache.set(key, null);
    return null;
  }
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
