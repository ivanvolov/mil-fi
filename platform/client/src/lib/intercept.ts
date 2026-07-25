import type { LatLng } from '@shared/schemas/common';
import { haversineKm } from '@shared/distance';

export type InterceptResult =
  | {
      kind: 'feasible';
      point: LatLng;
      /** Seconds from "now" until the engagement (threat time-to-waypoint). */
      ttiSec: number;
      /** Seconds the interceptor needs to fly to the engagement point. */
      flightSec: number;
      /** Launcher-to-intercept-point distance, km. */
      distKm: number;
      /** TTI − flightSec − launchDelaySec — the slack the operator has. */
      slackSec: number;
    }
  | { kind: 'infeasible'; reason: 'out of range' | 'too late' | 'no speed' | 'no path' };

/** Split each polyline segment into ~`stepKm` slices so a coarse 2-3 point path becomes a
 *  dense sample of the threat's track. Without this, `computeIntercept` only evaluates the
 *  launcher at the original waypoints — and a 15 km-range launcher checked at endpoints
 *  separated by 50 km will read "out of range" even if most of the segment passes through
 *  its ring. */
function densifyPath(points: LatLng[], stepKm: number): LatLng[] {
  if (points.length < 2) return points.slice();
  const out: LatLng[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segKm = haversineKm(a, b);
    const steps = Math.max(1, Math.ceil(segKm / stepKm));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  return out;
}

/** Walks a densified version of the threat path and returns the earliest sample where
 *  (a) the launcher is within range and (b) the interceptor can launch after
 *  `launchDelaySec` of operator prep and still arrive on time. Returns `infeasible` with
 *  the closest reason when no sample qualifies. */
export function computeIntercept(args: {
  launcherPos: LatLng;
  launcherRangeKm: number;
  launcherSpeedKmh: number;
  threatPath: LatLng[];
  threatSpeedKmh: number;
  launchDelaySec: number;
  /** Sampling resolution along the threat path in km. Defaults to 0.25 (250 m). */
  stepKm?: number;
}): InterceptResult {
  const {
    launcherPos, launcherRangeKm, launcherSpeedKmh,
    threatPath, threatSpeedKmh, launchDelaySec,
    stepKm = 0.25,
  } = args;
  if (threatSpeedKmh <= 0 || launcherSpeedKmh <= 0) return { kind: 'infeasible', reason: 'no speed' };
  if (threatPath.length < 2) return { kind: 'infeasible', reason: 'no path' };
  const dense = densifyPath(threatPath, stepKm);
  let cumKm = 0;
  let everInRange = false;
  for (let i = 0; i < dense.length; i++) {
    const w = dense[i]!;
    if (i > 0) cumKm += haversineKm(dense[i - 1]!, w);
    const dLauncher = haversineKm(launcherPos, w);
    if (dLauncher > launcherRangeKm) continue;
    everInRange = true;
    const threatTimeSec = (cumKm / threatSpeedKmh) * 3600;
    const flightSec = (dLauncher / launcherSpeedKmh) * 3600;
    const slackSec = threatTimeSec - flightSec - launchDelaySec;
    if (slackSec < 0) continue;
    return { kind: 'feasible', point: w, ttiSec: threatTimeSec, flightSec, distKm: dLauncher, slackSec };
  }
  return { kind: 'infeasible', reason: everInRange ? 'too late' : 'out of range' };
}
