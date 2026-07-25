import type { LatLng } from '@shared/schemas/common';
import { haversineKm } from '@shared/distance';

/** Crew placement (independent of launcher placement).
 *
 *  Model:
 *   • Crew #0 sits at the protected-area center. Always. It's the ONE asset allowed inside an
 *     NPZ, and it primary-threads every non-MFG launcher so none can ever be flagged NO-CREW.
 *   • Crews #1..C-1 are field crews clustered over the non-MFG launcher positions via k-means:
 *     each field crew lands at the centroid of its cluster, minimizing total crew↔launcher
 *     distance within its cluster. Field crews also thread every launcher in their cluster
 *     (override role), giving those launchers a second, closer operator option.
 *   • MFG launchers don't require crews (`requiresCrew: false`) and get no threads at all.
 *
 *  Independent of NPZ constraints — field crews inherit their positions from the launcher
 *  centroids, which the launcher placer already legalized. */

export type CrewThread = {
  crewIdx: number;
  launcherIdx: number;
  kind: 'primary' | 'override';
};

export type CrewPlanResult = {
  positions: LatLng[];
  /** Crew↔launcher thread assignments. Crew #0 (central control) threads every non-MFG
   *  launcher as PRIMARY (guarantees no launcher is ever NO-CREW). Each field crew threads
   *  the launchers in its k-means cluster as OVERRIDE (closer alternate operator). */
  threads: CrewThread[];
};

/** Kind of each launcher — needed so crews only cluster over non-MFG launchers. */
export type LauncherKind = 'mfg' | 'non-mfg';

/** Simple LatLng centroid (equirectangular avg — good enough for small clusters at the
 *  battlefield scale). */
function centroidLatLng(points: LatLng[]): LatLng {
  const n = points.length;
  if (n === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) { lat += p.lat; lng += p.lng; }
  return { lat: lat / n, lng: lng / n };
}

/** Assign each point to the nearest centroid; return the assignment array (index into
 *  centroids) and whether any point changed cluster from `prev`. */
function assignToNearest(points: LatLng[], centroids: LatLng[], prev: number[] | null): {
  next: number[];
  changed: boolean;
} {
  const next = new Array<number>(points.length);
  let changed = false;
  for (let i = 0; i < points.length; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = haversineKm(points[i]!, centroids[c]!);
      if (d < bestD) { bestD = d; best = c; }
    }
    next[i] = best;
    if (prev && prev[i] !== best) changed = true;
  }
  if (!prev) changed = true;
  return { next, changed };
}

/** Seed C centroids for k-means over `points` by taking the first C points after shuffling
 *  by (deterministic) angular sort around `origin`. Angular spread guarantees a reasonable
 *  starting spread even for tight clusters. */
function seedCentroids(points: LatLng[], origin: LatLng, C: number): LatLng[] {
  if (C <= 0 || points.length === 0) return [];
  if (C >= points.length) return points.slice();
  const sorted = points
    .map((p, i) => ({ p, i, ang: Math.atan2(p.lng - origin.lng, p.lat - origin.lat) }))
    .sort((a, b) => a.ang - b.ang);
  const step = sorted.length / C;
  const out: LatLng[] = [];
  for (let c = 0; c < C; c++) {
    const idx = Math.floor(c * step);
    out.push(sorted[idx]!.p);
  }
  return out;
}

export function planCrewPlacement(
  center: LatLng,
  launcherPositions: LatLng[],
  launcherKinds: LauncherKind[],
  crewCount: number,
): CrewPlanResult {
  if (crewCount <= 0) return { positions: [], threads: [] };

  const positions: LatLng[] = [];
  const threads: CrewThread[] = [];

  // Crew #0 — central control at the factory. Threads every non-MFG launcher (primary),
  // guaranteeing they're never NO-CREW.
  positions.push(center);
  const nonMfgIdx = launcherKinds
    .map((k, i) => (k === 'non-mfg' ? i : -1))
    .filter((i) => i >= 0);
  for (const li of nonMfgIdx) threads.push({ crewIdx: 0, launcherIdx: li, kind: 'primary' });

  const fieldCount = crewCount - 1;
  if (fieldCount <= 0 || nonMfgIdx.length === 0) {
    // No field crews to place; central crew alone.
    return { positions, threads };
  }

  // Field crews: k-means over non-MFG launcher positions.
  const clusterPoints = nonMfgIdx.map((li) => launcherPositions[li]!);
  const C = Math.min(fieldCount, clusterPoints.length);
  let centroids = seedCentroids(clusterPoints, center, C);
  let assignment: number[] | null = null;
  let iters = 0;
  const MAX_ITERS = 20;
  for (; iters < MAX_ITERS; iters++) {
    const { next, changed } = assignToNearest(clusterPoints, centroids, assignment);
    if (!changed) break;
    assignment = next;
    const grouped: LatLng[][] = Array.from({ length: C }, () => []);
    for (let i = 0; i < clusterPoints.length; i++) grouped[next[i]!]!.push(clusterPoints[i]!);
    for (let c = 0; c < C; c++) {
      if (grouped[c]!.length > 0) centroids[c] = centroidLatLng(grouped[c]!);
      // Empty clusters keep their previous centroid — no re-seed (rare with angular seeding).
    }
  }

  // Add field crews at their centroids. If fewer clusters than requested (fieldCount >
  // nonMfg count), extras stack round-robin on the existing centroids.
  for (let j = 0; j < fieldCount; j++) {
    positions.push(centroids[j % C]!);
  }

  // Field-crew threads: each field crew (override) threads every launcher in its cluster.
  // Crew index in `positions` is `1 + j`. Extras beyond `C` share the same centroid, so we
  // thread the FIRST field crew per cluster only — additional stacked crews get no distinct
  // launcher assignment (they exist as redundancy at the same position).
  const finalAssignment = assignment ?? new Array<number>(clusterPoints.length).fill(0);
  for (let i = 0; i < clusterPoints.length; i++) {
    const clusterIdx = finalAssignment[i]!;
    threads.push({
      crewIdx: 1 + clusterIdx,
      launcherIdx: nonMfgIdx[i]!,
      kind: 'override',
    });
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[planCrewPlacement]', {
      crews: crewCount,
      fieldCount,
      clusters: C,
      launchersClustered: clusterPoints.length,
      kmeansIters: iters,
    });
  }

  return { positions, threads };
}
