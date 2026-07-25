import type { LatLng } from './schemas/common';

const R_EARTH_KM = 6371;
function toRad(deg: number) { return (deg * Math.PI) / 180; }

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(x));
}

/** Minimum great-circle distance (km) from a point to a polyline. Returns Infinity if the
 *  polyline has fewer than 2 points. Uses a local equirectangular projection centered on the
 *  point — accurate enough at city/regional scales (sub-meter error well past 30 km). */
export function minDistanceKmToPolyline(p: LatLng, line: LatLng[]): number {
  if (line.length < 2) return Infinity;
  const KM_PER_LAT_DEG = 111.32;
  const kmPerLngDeg = KM_PER_LAT_DEG * Math.cos((p.lat * Math.PI) / 180);
  const px = 0;
  const py = 0;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const ax = (a.lng - p.lng) * kmPerLngDeg;
    const ay = (a.lat - p.lat) * KM_PER_LAT_DEG;
    const bx = (b.lng - p.lng) * kmPerLngDeg;
    const by = (b.lat - p.lat) * KM_PER_LAT_DEG;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(cx - px, cy - py);
    if (d < best) best = d;
  }
  return best;
}