import type { LatLng } from '@shared/schemas/common';
import type { Threat } from '@shared/schemas/threat';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { haversineKm, minDistanceKmToPolyline } from '@shared/distance';
import { DEFAULT_REDUNDANCY } from '@shared/schemas/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** WTA pass roles. `PRI` = first pass (best-available launcher), `BKP` = second, `BKP-N` for
 *  pass N when redundancy > 2. `MFG` is emitted separately for the descent-phase dwell pass. */
export type Role = 'PRI' | 'BKP' | 'MFG' | `BKP-${number}`;
export type Leg = 'cruise' | 'attack' | 'both';

export type Assignment = {
  threatId: string;
  launcher: Interceptor;
  type: InterceptorType;
  /** Distance from launcher to threat current position, km. */
  distKm: number;
  /** Min distance from launcher to the relevant predicted path leg, km. */
  closestKm: number;
  leg: Leg;
  role: Role;
  /** Per-engagement cost in USD if known. */
  costUsd: number | null;
  /** Predicted point on the threat's track where the engagement happens. Non-MFG only. */
  interceptPoint?: LatLng;
  /** Seconds from now until intercept (PRI/BKP) or until the threat enters the MFG ring (MFG). */
  ttiSec?: number;
  /** Seconds the interceptor needs to fly to its intercept point. Non-MFG only. */
  flightSec?: number;
  /** Only set for MFG assignments: seconds the attack-leg track spends inside the MFG ring. */
  dwellSec?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const MFG_MIN_DWELL_SEC = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Path helper (bulk allocator only)
// ─────────────────────────────────────────────────────────────────────────────

/** Walk the threat's predicted route: current position → cruise waypoints → attack waypoints,
 * falling back to the detonation point if no future legs are defined. */
function buildThreatPath(t: Threat): LatLng[] {
  const pts: LatLng[] = [t.position];
  for (const p of t.geometry.futureCruise ?? []) pts.push(p);
  for (const p of t.geometry.futureAttack ?? []) pts.push(p);
  if (pts.length < 2 && t.geometry.detonation) {
    pts.push({ lat: t.geometry.detonation.lat, lng: t.geometry.detonation.lng });
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk allocator (Orchestrate all)
// ─────────────────────────────────────────────────────────────────────────────

type FeasibleCand = {
  launcher: Interceptor;
  type: InterceptorType;
  distKm: number;
  closestKm: number;
  leg: Leg;
  interceptPoint?: LatLng;
  ttiSec?: number;
  flightSec?: number;
};

/** Physics-based intercept: walk the threat's predicted path segment-by-segment at ~25 m
 *  steps, return the earliest sample where (a) the launcher is within range and (b) the
 *  interceptor flying at its max speed reaches the sample no later than the threat does.
 *  Null means no such point exists on the trajectory — launcher can't intercept this
 *  threat and should be dropped from the plan. */
function physicsIntercept(
  launcher: Interceptor,
  type: InterceptorType,
  threat: Threat,
): { point: LatLng; ttiSec: number; flightSec: number; distKm: number } | null {
  if (threat.speedKmh <= 0) return null;
  const path = buildThreatPath(threat);
  if (path.length < 2) return null;
  const range = type.envelope.rangeKm;
  const vThreat = threat.speedKmh;
  const vInt = type.envelope.spdMaxKmh;
  const stepKm = 0.025;
  let cumKm = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const segKm = haversineKm(a, b);
    if (segKm <= 0) continue;
    const steps = Math.max(1, Math.ceil(segKm / stepKm));
    const dLat = (b.lat - a.lat) / steps;
    const dLng = (b.lng - a.lng) / steps;
    const stepLen = segKm / steps;
    for (let s = 1; s <= steps; s++) {
      const sample: LatLng = { lat: a.lat + dLat * s, lng: a.lng + dLng * s };
      const dLauncher = haversineKm(launcher.position, sample);
      if (dLauncher > range) continue;
      const threatKm = cumKm + stepLen * s;
      const threatTimeSec = (threatKm / vThreat) * 3600;
      const interceptorTimeSec = (dLauncher / vInt) * 3600;
      if (interceptorTimeSec > threatTimeSec) continue;
      return { point: sample, ttiSec: threatTimeSec, flightSec: interceptorTimeSec, distKm: dLauncher };
    }
    cumKm += segKm;
  }
  return null;
}

function feasibleNonMfgFor(
  threat: Threat,
  launchers: Interceptor[],
  typesById: Map<string, InterceptorType>,
): FeasibleCand[] {
  const cruise = threat.geometry.futureCruise ?? [];
  const attack = threat.geometry.futureAttack ?? [];
  const out: FeasibleCand[] = [];
  for (const launcher of launchers) {
    const type = typesById.get(launcher.typeId);
    if (!type || type.category === 'mfg') continue;
    const range = type.envelope.rangeKm;
    const dCruise = cruise.length >= 2 ? minDistanceKmToPolyline(launcher.position, cruise) : Infinity;
    const dAttack = attack.length >= 2 ? minDistanceKmToPolyline(launcher.position, attack) : Infinity;
    const inC = dCruise <= range;
    const inA = dAttack <= range;
    if (!inC && !inA) continue;
    const closestKm = Math.min(dCruise, dAttack);
    const leg: Leg = inC && inA ? 'both' : inC ? 'cruise' : 'attack';
    const phys = physicsIntercept(launcher, type, threat);
    // Strict physics gate: no time-feasible intercept on the trajectory → this launcher
    // can't intercept this threat, so it doesn't belong in the plan. The polyline range
    // check above is only a cheap pre-filter; physicsIntercept is the source of truth.
    if (!phys) continue;
    const distKm = haversineKm(launcher.position, threat.position);
    out.push({
      launcher, type, distKm, closestKm, leg,
      interceptPoint: phys.point,
      ttiSec: phys.ttiSec,
      flightSec: phys.flightSec,
    });
  }
  // Sort by raw launcher→threat distance — the "closest to the target" criterion.
  out.sort((a, b) => a.distKm - b.distKm);
  return out;
}

/** Walks the threat along its attack leg in ~25 m steps. Returns the seconds the threat
 *  spends inside the MFG ring (dwell) plus the seconds until it first enters the ring (TTI),
 *  measured from the START of the attack leg. Caller adds the threat's time-to-attack-start
 *  if it wants TTI from "now". */
function mfgRingTiming(
  mfg: Interceptor,
  attackLine: LatLng[],
  rangeKm: number,
  speedKmh: number,
): { dwellSec: number; entryFromAttackStartSec: number | null } {
  if (attackLine.length < 2 || speedKmh <= 0) return { dwellSec: 0, entryFromAttackStartSec: null };
  let kmInRange = 0;
  let kmTravelled = 0;
  let entryKm: number | null = null;
  for (let i = 1; i < attackLine.length; i++) {
    const a = attackLine[i - 1]!;
    const b = attackLine[i]!;
    const segKm = haversineKm(a, b);
    if (segKm <= 0) continue;
    const stepKm = 0.025;
    const steps = Math.max(1, Math.ceil(segKm / stepKm));
    const dLat = (b.lat - a.lat) / steps;
    const dLng = (b.lng - a.lng) / steps;
    const stepLen = segKm / steps;
    for (let s = 0; s < steps; s++) {
      const sample = { lat: a.lat + dLat * (s + 0.5), lng: a.lng + dLng * (s + 0.5) };
      const inRange = haversineKm(mfg.position, sample) <= rangeKm;
      if (inRange) {
        kmInRange += stepLen;
        if (entryKm === null) entryKm = kmTravelled;
      }
      kmTravelled += stepLen;
    }
  }
  return {
    dwellSec: (kmInRange / speedKmh) * 3600,
    entryFromAttackStartSec: entryKm === null ? null : (entryKm / speedKmh) * 3600,
  };
}

/** Threat's time-to-reach the start of its attack leg, measured from its current position. */
function timeToAttackStartSec(threat: Threat): number {
  if (threat.speedKmh <= 0) return 0;
  const cruise = threat.geometry.futureCruise ?? [];
  if (cruise.length < 2) {
    const attack = threat.geometry.futureAttack ?? [];
    if (attack.length < 1) return 0;
    return (haversineKm(threat.position, attack[0]!) / threat.speedKmh) * 3600;
  }
  let km = 0;
  for (let i = 1; i < cruise.length; i++) km += haversineKm(cruise[i - 1]!, cruise[i]!);
  return (km / threat.speedKmh) * 3600;
}

/** Greedy k-pass weapon-target assignment plus separate MFG dwell pass. `k` defaults to
 *  `DEFAULT_REDUNDANCY` (2), matching the redundancy target used by launcher placement so
 *  the fleet layout and the intercept plan agree on how many launchers cover each threat.
 *  Returns assignments grouped by threatId. See README for the full spec. */
export function allocate(
  threats: Threat[],
  launchers: Interceptor[],
  typesById: Map<string, InterceptorType>,
  opts?: { redundancyK?: number },
): Map<string, Assignment[]> {
  const out = new Map<string, Assignment[]>();
  for (const t of threats) out.set(t._id, []);

  // Non-MFG: k passes, each pass picks the closest still-unassigned launcher per threat.
  const k = Math.max(1, opts?.redundancyK ?? DEFAULT_REDUNDANCY);
  const candidatesByThreat = new Map<string, FeasibleCand[]>();
  for (const t of threats) candidatesByThreat.set(t._id, feasibleNonMfgFor(t, launchers, typesById));
  const assigned = new Set<string>();
  for (let pass = 1; pass <= k; pass++) {
    const role: Role = pass === 1 ? 'PRI' : pass === 2 ? 'BKP' : `BKP-${pass - 1}`;
    for (const t of threats) {
      const cands = candidatesByThreat.get(t._id) ?? [];
      const pick = cands.find((c) => !assigned.has(c.launcher._id));
      if (!pick) continue;
      assigned.add(pick.launcher._id);
      out.get(t._id)!.push({
        threatId: t._id,
        launcher: pick.launcher,
        type: pick.type,
        distKm: pick.distKm,
        closestKm: pick.closestKm,
        leg: pick.leg,
        role,
        costUsd: priceUsdFor(pick.launcher, pick.type),
        interceptPoint: pick.interceptPoint,
        ttiSec: pick.ttiSec,
        flightSec: pick.flightSec,
      });
    }
  }

  // MFG: only the attack/descent leg, only when the threat dwells in range long enough.
  // No exclusivity — an MFG can support multiple threats (and vice versa) if geometry holds.
  for (const mfg of launchers) {
    const type = typesById.get(mfg.typeId);
    if (!type || type.category !== 'mfg') continue;
    for (const t of threats) {
      const attack = t.geometry.futureAttack ?? [];
      if (attack.length < 2) continue;
      const ring = mfgRingTiming(mfg, attack, type.envelope.rangeKm, t.speedKmh);
      if (ring.dwellSec < MFG_MIN_DWELL_SEC) continue;
      const closestKm = minDistanceKmToPolyline(mfg.position, attack);
      const distKm = haversineKm(mfg.position, t.position);
      const ttiSec = ring.entryFromAttackStartSec !== null
        ? timeToAttackStartSec(t) + ring.entryFromAttackStartSec
        : undefined;
      out.get(t._id)!.push({
        threatId: t._id,
        launcher: mfg,
        type,
        distKm,
        closestKm,
        leg: 'attack',
        role: 'MFG',
        costUsd: priceUsdFor(mfg, type),
        ttiSec,
        dwellSec: ring.dwellSec,
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Per-engagement BOM cost (USD). Mock numbers for the operator panel — real costs vary widely
 *  and are deliberately not in the schema yet. Per-launcher code overrides win over per-type. */
const PRICE_USD_BY_CODE: Record<string, number> = {
  'L-9': 1500,
  'L-12': 2500,
};
const PRICE_USD_BY_KEY: Record<string, number> = {
  sting: 2000,
  'p1-sun-long': 15000,
  merops: 35000,
  mfg: 0,
};

export function priceUsdFor(launcher: Interceptor, type: InterceptorType | undefined): number | null {
  const byCode = PRICE_USD_BY_CODE[launcher.code];
  if (byCode != null) return byCode;
  if (!type) return null;
  return PRICE_USD_BY_KEY[type.key] ?? null;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return 'free';
  if (usd >= 10000) return `$${Math.round(usd / 1000)}k`;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
  return `$${usd}`;
}

