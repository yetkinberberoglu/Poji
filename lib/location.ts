import { Platform } from 'react-native';

export type Coords = { lat: number; lng: number; accuracy?: number };

/**
 * Ask the browser (or device) where the user is.
 * Resolves to null when they refuse or the device can't tell us —
 * callers should always have a manual address fallback.
 */
export function getCurrentLocation(): Promise<Coords | null> {
  return new Promise(resolve => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/** Turn coordinates into something a person can read, via OpenStreetMap */
export async function reverseGeocode(c: Coords): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${c.lat}&lon=${c.lng}&zoom=18`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const json = await res.json();
    const a = json.address || {};
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.house_number,
      a.suburb || a.village || a.town || a.city,
    ].filter(Boolean);
    return parts.length ? parts.join(' ') : (json.display_name || null);
  } catch {
    return null;
  }
}

export const mapsLink = (c: Coords) =>
  `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

export const directionsLink = (c: Coords) =>
  `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
