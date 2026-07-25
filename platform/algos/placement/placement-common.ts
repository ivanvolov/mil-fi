import type { LatLng } from '@shared/schemas/common';

/** Shared geometry + no-placement-zone helpers used by every placement algo (MFG donut,
 *  launcher rings, crew clusters). Kept independent of any specific optimizer so the three
 *  algos can evolve without stepping on each other.
 *
 *  Coordinate system: km east (x), km north (y), origin at some center LatLng passed in
 *  per-call. Callers project LatLng NPZ rings into this frame with `latLngRingToKm`. */

export const KM_PER_LAT_DEG = 111.32;

/** ANY two launchers — MFG or non-MFG — must be at least this far apart. Universal rule:
 *  no pair (MFG↔MFG, MFG↔non-MFG, non-MFG↔non-MFG) can share ground closer than this. */
export const MIN_SEPARATION_KM = 0.5;

/** km east, km north relative to a center LatLng. */
export type Pt = { x: number; y: number };

/** A no-placement polygon in the same local km-frame as the demand grid (x east, y north). */
export type ExclusionPolygonKm = Array<Pt>;

export function toLatLng(center: LatLng, p: Pt): LatLng {
  const kmPerLng = KM_PER_LAT_DEG * Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: center.lat + p.y / KM_PER_LAT_DEG,
    lng: center.lng + p.x / (kmPerLng || KM_PER_LAT_DEG),
  };
}

/** Bearing (deg, clockwise from north) + distance (km) → local km-offset. */
export function bearingOffset(bearingDeg: number, distanceKm: number): Pt {
  const rad = ((90 - bearingDeg) * Math.PI) / 180;
  return { x: distanceKm * Math.cos(rad), y: distanceKm * Math.sin(rad) };
}

/** Project a LatLng ring into the local km-frame centered on `origin`. */
export function latLngRingToKm(origin: LatLng, ring: LatLng[]): ExclusionPolygonKm {
  const kmPerLng = KM_PER_LAT_DEG * Math.cos((origin.lat * Math.PI) / 180) || KM_PER_LAT_DEG;
  return ring.map((p) => ({
    x: (p.lng - origin.lng) * kmPerLng,
    y: (p.lat - origin.lat) * KM_PER_LAT_DEG,
  }));
}

/** Belt-and-suspenders check: true iff `pt` (in LatLng) lands inside any NPZ ring. Rings must
 *  already be projected to the same km-frame as `origin`. */
export function isLatLngInAnyZone(origin: LatLng, pt: LatLng, zones: ExclusionPolygonKm[]): boolean {
  if (zones.length === 0) return false;
  const kmPerLng = KM_PER_LAT_DEG * Math.cos((origin.lat * Math.PI) / 180) || KM_PER_LAT_DEG;
  const p: Pt = {
    x: (pt.lng - origin.lng) * kmPerLng,
    y: (pt.lat - origin.lat) * KM_PER_LAT_DEG,
  };
  return pointInAny(p, zones);
}

/** Ray-cast point-in-polygon (open ring, orientation-agnostic). */
export function pointInPolygon(pt: Pt, ring: ExclusionPolygonKm): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const intersects = a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInAny(pt: Pt, zones: ExclusionPolygonKm[]): boolean {
  for (const z of zones) if (pointInPolygon(pt, z)) return true;
  return false;
}

/**
 * Given an intended bearing + radius from center, find the nearest point that is NOT inside any
 * NPZ, prioritizing (a) staying near the intended bearing/radius, (b) staying inside `maxRadiusKm`.
 * Returns null only if no free spot exists within a generous search envelope.
 */
export function findFreeSpot(
  bearing0: number,
  radius0: number,
  exclusions: ExclusionPolygonKm[],
  maxRadiusKm: number,
): Pt | null {
  const inZone = (p: Pt): boolean => pointInAny(p, exclusions);

  // 1. Original position.
  const p0 = bearingOffset(bearing0, radius0);
  if (!inZone(p0)) return p0;

  // 2. Angular sweep at the intended radius (5° steps, ±180°). Keeps distance from center.
  for (let dtheta = 5; dtheta <= 180; dtheta += 5) {
    for (const s of [1, -1]) {
      const p = bearingOffset(bearing0 + s * dtheta, radius0);
      if (!inZone(p)) return p;
    }
  }

  // 3. Radial sweep along the intended bearing (0.25 km steps). Keeps bearing, drifts distance.
  for (let dr = 0.25; dr <= maxRadiusKm; dr += 0.25) {
    for (const s of [1, -1]) {
      const r = radius0 + s * dr;
      if (r < 0 || r > maxRadiusKm) continue;
      const p = bearingOffset(bearing0, r);
      if (!inZone(p)) return p;
    }
  }

  // 4. Combined spiral (10° × 0.5 km) — last resort before giving up.
  for (let dr = 0.5; dr <= maxRadiusKm; dr += 0.5) {
    for (let dtheta = 10; dtheta <= 180; dtheta += 10) {
      for (const bs of [1, -1]) {
        for (const rs of [1, -1]) {
          const r = radius0 + rs * dr;
          if (r < 0 || r > maxRadiusKm) continue;
          const p = bearingOffset(bearing0 + bs * dtheta, r);
          if (!inZone(p)) return p;
        }
      }
    }
  }

  return null;
}

/** Legal ground within `maxR` of center, excluding NPZ. Used as the candidate set for the
 *  MFG donut greedy so the optimizer can never pick illegal ground in the first place. */
export function buildLegalCandidates(
  maxR: number,
  exclusions: ExclusionPolygonKm[],
  step: number,
): Pt[] {
  const pts: Pt[] = [];
  const m2 = maxR * maxR;
  for (let y = -maxR; y <= maxR + 1e-9; y += step) {
    for (let x = -maxR; x <= maxR + 1e-9; x += step) {
      if (x * x + y * y > m2) continue;
      if (exclusions.length > 0 && pointInAny({ x, y }, exclusions)) continue;
      pts.push({ x, y });
    }
  }
  if (pts.length === 0) pts.push({ x: 0, y: 0 });
  return pts;
}

/**
 * Push any pair of launchers (MFG or non-MFG) closer than `MIN_SEPARATION_KM` apart.
 * Universal rule — MFG↔MFG, MFG↔non-MFG, non-MFG↔non-MFG all obey it. Handles the case
 * where nudging (or the tangent fan) landed two launchers near each other across group or
 * category boundaries. Bounded loop; stops when no pair moved on a full pass.
 */
export function enforceMinSeparation(
  positions: Pt[],
  launcherIdx: number[],
  exclusions: ExclusionPolygonKm[],
): void {
  if (launcherIdx.length < 2) return;
  const minSep = MIN_SEPARATION_KM;
  const minSepSq = minSep * minSep;
  const maxPasses = 12;
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let a = 0; a < launcherIdx.length; a++) {
      const ia = launcherIdx[a]!;
      const pa = positions[ia];
      if (!pa) continue;
      for (let b = a + 1; b < launcherIdx.length; b++) {
        const ib = launcherIdx[b]!;
        const pb = positions[ib];
        if (!pb) continue;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minSepSq - 1e-9) continue;
        const dist = Math.sqrt(distSq);
        const need = (minSep - dist) / 2 + 0.001;
        let ux: number;
        let uy: number;
        if (dist < 1e-6) {
          const bearing = pb.x === 0 && pb.y === 0
            ? 0
            : (Math.atan2(pb.x, pb.y) * 180) / Math.PI;
          const dir = bearingOffset(bearing, 1);
          ux = dir.x; uy = dir.y;
        } else {
          ux = dx / dist; uy = dy / dist;
        }
        const movedPb = { x: pb.x + ux * need, y: pb.y + uy * need };
        const movedPa = { x: pa.x - ux * need, y: pa.y - uy * need };
        const pbLegal = exclusions.length === 0 || !pointInAny(movedPb, exclusions);
        const paLegal = exclusions.length === 0 || !pointInAny(movedPa, exclusions);
        if (pbLegal && paLegal) {
          positions[ib] = movedPb;
          positions[ia] = movedPa;
          moved = true;
        } else if (pbLegal) {
          positions[ib] = { x: pb.x + ux * (minSep - dist + 0.001), y: pb.y + uy * (minSep - dist + 0.001) };
          moved = true;
        } else if (paLegal) {
          positions[ia] = { x: pa.x - ux * (minSep - dist + 0.001), y: pa.y - uy * (minSep - dist + 0.001) };
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}
