/**
 * Reverse Geocoding Utility
 * Converts latitude & longitude coordinates into readable human-friendly vicinity/neighborhood names.
 * Uses Nominatim with fast fallback to BigDataCloud and in-memory caching.
 */

const MAX_CACHE_SIZE = 500;
const vicinityCache = new Map<string, string>();

function setCachedVicinity(key: string, value: string) {
  if (vicinityCache.size >= MAX_CACHE_SIZE) {
    const firstKey = vicinityCache.keys().next().value;
    if (firstKey) vicinityCache.delete(firstKey);
  }
  vicinityCache.set(key, value);
}

export async function getVicinityName(lat: number, lng: number): Promise<string | null> {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  // Key accurate to ~100 meters
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (vicinityCache.has(cacheKey)) {
    return vicinityCache.get(cacheKey) || null;
  }

  // 1. Primary: OpenStreetMap Nominatim
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "HarvestersAttendanceApp/1.0 (contact: admin@harvestersng.org)",
        },
      }
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const addr = data?.address;
      if (addr) {
        const primary = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || addr.road;
        const secondary = addr.town || addr.city_district || addr.city || addr.county;
        const parts = [primary, secondary].filter(Boolean);
        const unique = Array.from(new Set(parts));

        if (unique.length > 0) {
          const result = unique.join(", ");
          setCachedVicinity(cacheKey, result);
          return result;
        }
      }

      if (data?.display_name) {
        const segments = data.display_name.split(",").map((s: string) => s.trim());
        const result = segments.slice(0, 2).join(", ");
        setCachedVicinity(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Fall back to secondary service
  }

  // 2. Secondary fallback: BigDataCloud Reverse Geocoding
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const parts = [data?.locality, data?.city || data?.principalSubdivision].filter(Boolean);
      const unique = Array.from(new Set(parts));

      if (unique.length > 0) {
        const result = unique.join(", ");
        setCachedVicinity(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Graceful silent fallback
  }

  return null;
}
