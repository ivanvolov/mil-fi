import type { LatLng } from '@shared/schemas/common';

export const POLYGON_POINTS_MIN = 3;
export const POLYGON_POINTS_MAX = 32;

/**
 * Change a polygon ring's vertex count while keeping its shape:
 * - growing inserts midpoints on the longest edges;
 * - shrinking removes the vertices whose removal disturbs the outline least
 *   (smallest triangle with its neighbors, Visvalingam-style).
 */
export function resamplePolygonPoints(points: LatLng[], target: number): LatLng[] {
  const n = Math.max(POLYGON_POINTS_MIN, Math.min(POLYGON_POINTS_MAX, Math.round(target)));
  const pts = points.map((p) => ({ ...p }));
  // Scale lng by cos(lat) so edge lengths/areas compare fairly away from the equator.
  const midLat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const kx = Math.cos((midLat * Math.PI) / 180);

  const edgeLen2 = (a: LatLng, b: LatLng) => {
    const dLat = a.lat - b.lat;
    const dLng = (a.lng - b.lng) * kx;
    return dLat * dLat + dLng * dLng;
  };

  while (pts.length < n) {
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < pts.length; i++) {
      const len = edgeLen2(pts[i]!, pts[(i + 1) % pts.length]!);
      if (len > bestLen) { bestLen = len; best = i; }
    }
    const a = pts[best]!;
    const b = pts[(best + 1) % pts.length]!;
    pts.splice(best + 1, 0, { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
  }

  const earArea = (i: number) => {
    const a = pts[(i - 1 + pts.length) % pts.length]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % pts.length]!;
    return Math.abs((b.lat - a.lat) * ((c.lng - a.lng) * kx) - ((b.lng - a.lng) * kx) * (c.lat - a.lat));
  };

  while (pts.length > n) {
    let best = 0;
    let bestArea = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const area = earArea(i);
      if (area < bestArea) { bestArea = area; best = i; }
    }
    pts.splice(best, 1);
  }

  return pts;
}
