import type { LatLng } from '@shared/schemas/common';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { DEFAULT_REDUNDANCY } from '@shared/schemas/defaults';
import {
  type ExclusionPolygonKm,
  type Pt,
  bearingOffset,
  enforceMinSeparation,
  findFreeSpot,
  pointInAny,
  toLatLng,
} from './placement-common.js';

/** Analytic-ring placement for non-MFG launchers.
 *
 *  Geometry:
 *   - `N` launchers on a circle around the factory, evenly spaced 360°/N apart.
 *   - Ring radius `d` picked so every azimuth is covered by ≥ `k` launchers' range rings.
 *
 *  The math (for launchers of range r, ring radius d > r): each launcher covers an azimuth
 *  wedge of half-angle α = asin(r/d) as seen from the factory. For uniform k-fold coverage
 *  around 360°, need α ≥ k·π/N, i.e. `d ≤ r / sin(k·π/N)`. When `k·π/N > π/2` (few launchers,
 *  high k) the formula breaks: use `d = r · cos(π/N)`, which puts the launcher inside r so
 *  it covers ALL bearings (giving `k = N` — always ≥ requested). Same signature as MFG
 *  placement so callers can compose the two.
 *
 *  Mixed ranges: split the fleet at the biggest natural range gap. Long-range launchers
 *  form the OUTER ring (long reach, k = 1); short-range form the INNER ring rotated to
 *  fill the outer's midpoints (adds up to combined k = requested). Homogeneous fleets
 *  (top range < 1.3× bottom) stay on one ring sized for the full k.
 *
 *  No directional bias — every azimuth is equally defended. If threat expectation is
 *  one-sided, the operator manually places assets instead.
 */

export type LauncherPlanResult = {
  /** LatLng positions in the same order as the input `launcherTypes`. */
  positions: LatLng[];
};

/** Max ring radius that still gives k-fold coverage from M evenly-spaced launchers of range r.
 *  When k·π/M > π/2, no d > r can hit k-fold — pack inside r so every launcher covers all
 *  bearings (M-fold coverage everywhere, which is ≥ k). */
function ringRadiusForK(range: number, M: number, k: number): number {
  if (M < 1 || range <= 0) return 0;
  if (M === 1) return 0;
  const angle = (k * Math.PI) / M;
  if (angle < Math.PI / 2 - 1e-9) return range / Math.sin(angle);
  return range * Math.cos(Math.PI / M);
}

/** Split the fleet at the biggest natural range gap. If top range < 1.3× bottom, no split.
 *  Returns index arrays into the original launcher list (short → inner, long → outer). */
function splitByRangeGap(ranges: number[]): { inner: number[]; outer: number[] } {
  const N = ranges.length;
  if (N < 2) return { inner: [], outer: ranges.map((_, i) => i) };

  const sorted = ranges.map((r, i) => ({ r, i })).sort((a, b) => a.r - b.r);
  const minR = sorted[0]!.r;
  const maxR = sorted[N - 1]!.r;
  if (minR <= 0 || maxR / minR < 1.3) {
    return { inner: [], outer: ranges.map((_, i) => i) };
  }

  // Biggest consecutive gap (ratio-based — a 5→10 gap outweighs 20→22).
  let splitAt = 0;
  let bestRatio = 0;
  for (let i = 1; i < N; i++) {
    const lo = sorted[i - 1]!.r;
    const hi = sorted[i]!.r;
    const ratio = lo > 0 ? hi / lo : Infinity;
    if (ratio > bestRatio) { bestRatio = ratio; splitAt = i; }
  }
  const inner = sorted.slice(0, splitAt).map((s) => s.i);
  const outer = sorted.slice(splitAt).map((s) => s.i);
  return { inner, outer };
}

/** Build launcher km-positions for one ring: M launchers at bearings `0 + rotation, 360/M
 *  + rotation, ...` at distance `d` from center. Result maps ring-local index i → Pt. */
function ringPositions(M: number, d: number, rotationDeg: number): Pt[] {
  const out: Pt[] = [];
  if (M === 0) return out;
  if (M === 1) { out.push(bearingOffset(rotationDeg, d)); return out; }
  const step = 360 / M;
  for (let i = 0; i < M; i++) out.push(bearingOffset(rotationDeg + i * step, d));
  return out;
}

/** Nudge a single launcher position out of any NPZ it landed inside. Uses the shared
 *  angular-first, radial-second, spiral-last search. Returns the original position if it's
 *  already legal, or if no free spot is found within the search envelope. */
function nudgeOne(pos: Pt, exclusions: ExclusionPolygonKm[], searchKm: number): Pt {
  if (exclusions.length === 0) return pos;
  if (!pointInAny(pos, exclusions)) return pos;
  const bearing = (Math.atan2(pos.x, pos.y) * 180) / Math.PI;
  const radius = Math.hypot(pos.x, pos.y);
  const nudged = findFreeSpot(
    Number.isFinite(bearing) ? bearing : 0,
    radius,
    exclusions,
    searchKm,
  );
  return nudged ?? pos;
}

export function planLauncherPlacement(
  center: LatLng,
  coverageRadiusKm: number,
  launcherTypes: InterceptorType[],
  opts?: {
    redundancyK?: number;
    noPlacementZones?: ExclusionPolygonKm[];
  },
): LauncherPlanResult {
  const N = launcherTypes.length;
  if (N === 0) return { positions: [] };

  const ranges = launcherTypes.map((t) => t.envelope.rangeKm);
  const exclusions = opts?.noPlacementZones ?? [];
  const k = Math.max(1, opts?.redundancyK ?? DEFAULT_REDUNDANCY);

  const positions = new Array<Pt>(N);

  // Envelope for the NPZ nudger: perimeter-defense model — a launcher outside the coverage
  // disk still shields it as long as (distance from center) ≤ (coverage + its own range).
  const maxRange = Math.max(...ranges, 0);
  const nudgeSearchKm = Math.max(
    coverageRadiusKm + maxRange + 5,
    coverageRadiusKm * 2 + 5,
  );

  const split = splitByRangeGap(ranges);
  const twoRing = split.inner.length > 0 && split.outer.length > 0;

  // Per-ring k target. Two-ring case: outer delivers k=1 (long reach), inner contributes the
  // remaining redundancy (rotated to fill outer midpoints). Single-ring case: full k.
  const kOuter = twoRing ? 1 : k;
  const kInner = twoRing ? Math.max(1, k - 1) : 0;

  // Outer ring.
  const outerN = split.outer.length;
  const outerRanges = split.outer.map((i) => ranges[i]!);
  const outerMeanR = outerN > 0 ? outerRanges.reduce((s, r) => s + r, 0) / outerN : 0;
  const outerD = outerN > 0 ? ringRadiusForK(outerMeanR, outerN, kOuter) : 0;
  const outerPositions = ringPositions(outerN, outerD, 0);
  outerPositions.forEach((p, k2) => {
    positions[split.outer[k2]!] = nudgeOne(p, exclusions, nudgeSearchKm);
  });

  // Inner ring (only in two-ring mode). Rotate so its peaks land at the outer midpoints.
  const innerN = split.inner.length;
  const innerRanges = split.inner.map((i) => ranges[i]!);
  const innerMeanR = innerN > 0 ? innerRanges.reduce((s, r) => s + r, 0) / innerN : 0;
  const innerD = innerN > 0 ? ringRadiusForK(innerMeanR, innerN, kInner) : 0;
  const innerRotation = twoRing && outerN > 0 ? 180 / outerN : 0;
  const innerPositions = ringPositions(innerN, innerD, innerRotation);
  innerPositions.forEach((p, k2) => {
    positions[split.inner[k2]!] = nudgeOne(p, exclusions, nudgeSearchKm);
  });

  // Universal min-separation post-pass — MFG ↔ launcher pairs are handled by the caller's
  // combined sweep, but same-ring collisions from nudging get flattened here.
  const allIdx = Array.from({ length: N }, (_, i) => i);
  enforceMinSeparation(positions, allIdx, exclusions);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[planLauncherPlacement]', {
      launchers: N,
      redundancyK: k,
      split: twoRing ? 'two-ring' : 'single-ring',
      outer: { count: outerN, meanRangeKm: +outerMeanR.toFixed(2), d: +outerD.toFixed(2), k: kOuter },
      inner: { count: innerN, meanRangeKm: +innerMeanR.toFixed(2), d: +innerD.toFixed(2), k: kInner, rotationDeg: innerRotation },
      exclusions: exclusions.length,
      coverageRadiusKm,
    });
  }

  return { positions: positions.map((p) => toLatLng(center, p ?? { x: 0, y: 0 })) };
}
