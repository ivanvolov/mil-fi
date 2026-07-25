import type { LatLng } from '@shared/schemas/common';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import {
  MIN_SEPARATION_KM,
  type ExclusionPolygonKm,
  type Pt,
  bearingOffset,
  buildLegalCandidates,
  enforceMinSeparation,
  findFreeSpot,
  pointInAny,
  toLatLng,
} from './placement-common.js';

/** MFG donut placement.
 *
 * MFGs are terminal-phase point-defense: they must catch a threat during its descent, so they
 * cover the "donut" — the annulus [R_p, R_p + descent] around the protected disk. This algo:
 *
 *   1. Discretizes the donut (demand cells) and the legal placement disk (candidate cells),
 *      carving NPZ out of both.
 *   2. Greedy max-coverage: place longest-range MFG first on the candidate whose range ring
 *      catches the most still-uncovered donut cells, honoring 0.5 km min-separation.
 *   3. Post-pass: enforces min-separation across all MFGs (handles ties/collisions).
 *
 * Independent of launcher placement — MFGs cover the descent ring, launchers cover the
 * approach disk. The two objectives don't share demand cells. */

/** Cells that MUST fall inside some MFG ring: the descent "donut" — the annulus
 *  [rInner, rOuter] around the protected disk — minus any NPZ cell. */
export function buildAnnulusDemand(
  rInner: number,
  rOuter: number,
  exclusions: ExclusionPolygonKm[],
  step: number,
): Pt[] {
  const pts: Pt[] = [];
  const rI2 = rInner * rInner;
  const rO2 = rOuter * rOuter;
  for (let y = -rOuter; y <= rOuter + 1e-9; y += step) {
    for (let x = -rOuter; x <= rOuter + 1e-9; x += step) {
      const d2 = x * x + y * y;
      if (d2 < rI2 || d2 > rO2) continue;
      if (exclusions.length > 0 && pointInAny({ x, y }, exclusions)) continue;
      pts.push({ x, y });
    }
  }
  if (pts.length === 0) pts.push({ x: (rInner + rOuter) / 2, y: 0 });
  return pts;
}

/**
 * Greedy max-coverage of the donut. Longest-range MFG first; each is placed on the legal
 * candidate whose range ring catches the most STILL-UNCOVERED donut cells, honoring min
 * separation. Returns positions in the same order as `mfgRanges`. Deterministic (fixed
 * candidate order, first-max wins).
 */
export function placeMfgDonut(
  mfgRanges: number[],
  demand: Pt[],
  candidates: Pt[],
  minSepKm: number,
): Pt[] {
  const covered = new Array<boolean>(demand.length).fill(false);
  const placed: Pt[] = [];
  const result = new Array<Pt>(mfgRanges.length);
  const minSep2 = minSepKm * minSepKm;
  const order = mfgRanges.map((_, i) => i).sort((a, b) => (mfgRanges[b]! - mfgRanges[a]!));
  for (const li of order) {
    const R2 = mfgRanges[li]! * mfgRanges[li]!;
    let best: Pt | null = null;
    let bestGain = -1;
    for (const c of candidates) {
      let tooClose = false;
      for (const p of placed) {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        if (dx * dx + dy * dy < minSep2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      let gain = 0;
      for (let d = 0; d < demand.length; d++) {
        if (covered[d]) continue;
        const dm = demand[d]!;
        const dx = dm.x - c.x;
        const dy = dm.y - c.y;
        if (dx * dx + dy * dy <= R2) gain++;
      }
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    const chosen = best ?? placed[placed.length - 1] ?? { x: 0, y: 0 };
    for (let d = 0; d < demand.length; d++) {
      if (covered[d]) continue;
      const dm = demand[d]!;
      const dx = dm.x - chosen.x;
      const dy = dm.y - chosen.y;
      if (dx * dx + dy * dy <= R2) covered[d] = true;
    }
    placed.push(chosen);
    result[li] = chosen;
  }
  return result;
}

export type MfgHeatCell = { lat: number; lng: number; gain: number };
export type LatLngCell = { lat: number; lng: number };
export type MfgHeatmap = {
  /** The placement field (blue): legal spots, shaded by coverage gain. */
  candidateCells: MfgHeatCell[];
  /** The donut requirement (red): annulus cells [R_p, R_p+L] the MFG rings must cover. */
  demandCells: LatLngCell[];
  maxGain: number;
  cellKm: number;
  rInnerKm: number;
  rOuterKm: number;
};

/**
 * Diagnostic view of the MFG optimizer's coverage surface, for overlaying on the map.
 *  - `demandCells` (red): the donut [R_p, R_p+L] the MFG groups must cover, NPZ carved out.
 *  - `candidateCells` (blue): every LEGAL placement spot, `gain` = how many donut cells a ring of
 *    `mfgRangeKm` there would cover — the surface the greedy climbs. The field reaches 1.5× the MFG
 *    range beyond the donut edge, minus NPZ, so it shows all the ground a fire group could usefully
 *    stand on. Cells inside a no-placement zone are simply absent — the exclusion, made visible.
 * Uses the same demand/candidate builders as `planMfgPlacement`, so the picture matches Apply.
 * `cellKm` sets the grid cell size; when absent, resolution is derived from the MFG range.
 */
export function computeMfgHeatmap(
  center: LatLng,
  protectionRadiusKm: number,
  descentLengthKm: number,
  mfgRangeKm: number,
  exclusions: ExclusionPolygonKm[],
  cellKm?: number,
): MfgHeatmap {
  const rInner = Math.max(0, protectionRadiusKm);
  const rOuter = rInner + Math.max(0, descentLengthKm);
  const R = Math.max(0.1, mfgRangeKm);
  const candR = rOuter + 1.5 * R;
  let step =
    cellKm != null && Number.isFinite(cellKm) && cellKm > 0
      ? cellKm
      : Math.min(0.5, Math.max(0.15, R / 8));
  const approx = (Math.PI * candR * candR) / (step * step);
  if (approx > 12000) step = candR * Math.sqrt(Math.PI / 12000);
  const demand = buildAnnulusDemand(rInner, rOuter, exclusions, step);
  const candidates = buildLegalCandidates(candR, exclusions, step);
  const R2 = R * R;
  let maxGain = 1;
  const candidateCells: MfgHeatCell[] = [];
  for (const c of candidates) {
    let gain = 0;
    for (let d = 0; d < demand.length; d++) {
      const dm = demand[d]!;
      const dx = dm.x - c.x;
      const dy = dm.y - c.y;
      if (dx * dx + dy * dy <= R2) gain++;
    }
    if (gain > maxGain) maxGain = gain;
    // Keep zero-gain cells so the placement-disk boundary reads symmetric: they're legal
    // ground, just not useful. Renderer maps gain=0 to the base 0.10 opacity — visible as
    // a faint disk outline without competing with the gain shading.
    const ll = toLatLng(center, c);
    candidateCells.push({ lat: ll.lat, lng: ll.lng, gain });
  }
  const demandCells: LatLngCell[] = demand.map((d) => {
    const ll = toLatLng(center, d);
    return { lat: ll.lat, lng: ll.lng };
  });
  return { candidateCells, demandCells, maxGain, cellKm: step, rInnerKm: rInner, rOuterKm: rOuter };
}

export type MfgPlanResult = {
  /** LatLng positions in the same order as the input `mfgTypes`. */
  positions: LatLng[];
};

/**
 * Place `mfgTypes.length` MFG launchers to cover the descent donut around the protected disk.
 *
 * `center` is the protected-area center (factory); `protectRadiusKm` is the disk we want
 * threats to detonate outside of; `descentLengthKm` is the drone's descent-phase length —
 * the width of the annulus MFGs must cover. NPZ rings (in the same km-frame as `center`)
 * are honored strictly; MFGs never land inside them, and the placement field is trimmed to
 * legal ground before the greedy runs.
 *
 * Returns launcher LatLngs in input order (empty if `mfgTypes.length === 0`).
 */
export function planMfgPlacement(
  center: LatLng,
  protectRadiusKm: number,
  mfgTypes: InterceptorType[],
  descentLengthKm: number,
  opts?: { noPlacementZones?: ExclusionPolygonKm[] },
): MfgPlanResult {
  if (mfgTypes.length === 0) return { positions: [] };
  const exclusions = opts?.noPlacementZones ?? [];
  const ranges = mfgTypes.map((t) => t.envelope.rangeKm);

  const rInner = protectRadiusKm;
  const rOuter = protectRadiusKm + Math.max(0, descentLengthKm);
  const maxRange = Math.max(...ranges, 0.1);
  const candR = rOuter + maxRange;

  // Resolution tied to weapon scale; coarsen if the candidate disk would explode.
  let step = Math.min(1.0, Math.max(0.25, maxRange / 4));
  const approxCells = (Math.PI * candR * candR) / (step * step);
  if (approxCells > 5000) step = candR * Math.sqrt(Math.PI / 5000);

  const demand = buildAnnulusDemand(rInner, rOuter, exclusions, step);
  const legalCands = buildLegalCandidates(candR, exclusions, step);
  const donutPositions = placeMfgDonut(ranges, demand, legalCands, MIN_SEPARATION_KM);

  // Safety net: if greedy left any position inside an NPZ (shouldn't happen — candidates are
  // pre-filtered — but the fallback tail can dump on the last-placed spot), nudge it out.
  const nudgeSearchKm = candR + 5;
  const positions = donutPositions.map((p, i) => {
    if (exclusions.length === 0 || !pointInAny(p, exclusions)) return p;
    const bearing = (Math.atan2(p.x, p.y) * 180) / Math.PI;
    const radius = Math.hypot(p.x, p.y);
    const nudged = findFreeSpot(bearing, radius, exclusions, nudgeSearchKm);
    return nudged ?? p;
  });

  // Universal min-sep pass (also protects against greedy-first ties + nudge collisions).
  const allIdx = Array.from({ length: positions.length }, (_, i) => i);
  enforceMinSeparation(positions, allIdx, exclusions);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[planMfgPlacement]', {
      mfgs: mfgTypes.length,
      protectRadiusKm,
      descentLengthKm,
      donutStepKm: step,
      demandCells: demand.length,
      candidateCells: legalCands.length,
      exclusions: exclusions.length,
    });
  }

  // Guard against the rare `bearingOffset` result that lands at (NaN, NaN) — replace with center.
  return {
    positions: positions.map((p) => toLatLng(center, p)),
  };
}
