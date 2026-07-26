import type { LatLng } from '@shared/schemas/common';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { ThreatCreate } from '@shared/schemas/threat';
import { haversineKm } from '@shared/distance';
import { LAUNCH_PRESETS } from '@algos/threat-placement/threat-sim-presets';
import { randomContactInSector } from '@algos/threat-placement/threat-sim';

/** Shared math for the demo strike animation — used by both the 2D (Leaflet) and 3D
 *  (MapLibre) map hosts so the button (in LeftRail) can trigger whichever one is mounted. */

export const DEMO_STRIKE_DURATION_MS = 3200;
export const DEMO_STRIKE_ARM_FRACTION = 0.6;

const METERS_PER_LAT_DEG = 111320;
function metersPerLngDeg(lat: number): number {
  return METERS_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180);
}
/** Fallback origin if launch presets are ever empty — a point `distanceKm` away at a random bearing. */
function randomFarOrigin(center: LatLng, distanceKm: number): LatLng {
  const bearingRad = Math.random() * 2 * Math.PI;
  const dx = distanceKm * 1000 * Math.cos(bearingRad);
  const dy = distanceKm * 1000 * Math.sin(bearingRad);
  return { lat: center.lat + dy / METERS_PER_LAT_DEG, lng: center.lng + dx / metersPerLngDeg(center.lat) };
}

/** Concatenates a threat's current position + its cruise/attack legs into one flight path,
 *  ending at the detonation point, deduping near-identical adjacent points at leg boundaries. */
export function buildFlightPath(
  position: LatLng,
  geometry: { futureCruise: LatLng[] | null; futureAttack: LatLng[] | null; detonation: { lat: number; lng: number } },
): LatLng[] {
  const raw: LatLng[] = [position, ...(geometry.futureCruise ?? []), ...(geometry.futureAttack ?? []), geometry.detonation];
  const out: LatLng[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || haversineKm(last, p) > 0.001) out.push(p);
  }
  return out;
}

export function cumulativeKm(pts: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversineKm(pts[i - 1]!, pts[i]!));
  return cum;
}

export function pointAtFraction(pts: LatLng[], cum: number[], frac: number): LatLng {
  const total = cum[cum.length - 1]!;
  if (total <= 0) return pts[pts.length - 1]!;
  const target = frac * total;
  for (let i = 1; i < cum.length; i++) {
    if (target <= cum[i]!) {
      const segLen = cum[i]! - cum[i - 1]!;
      const segT = segLen > 0 ? (target - cum[i - 1]!) / segLen : 0;
      const a = pts[i - 1]!, b = pts[i]!;
      return { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT };
    }
  }
  return pts[pts.length - 1]!;
}

/** Picks a random threat that already has a detonation point set. */
export function pickRandomLiveThreat<T extends { geometry: { detonation: unknown } }>(threats: T[]): T | null {
  const candidates = threats.filter((t) => t.geometry.detonation);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

/** Builds the body for one inbound threat near `center`, ETA ~1.5–3 min out — same math as
 *  ThreatSimulatorDialog's single-contact case, just auto-placed with no setup UI. */
export function buildRandomThreatBody(data: LayerFull, center: LatLng): ThreatCreate | null {
  const shahedType = data.types.threat.find((t) => t.key === 'shahed-136') ?? data.types.threat[0];
  if (!shahedType) return null;

  const contact = randomContactInSector(center, 6, 0, 360);
  const origin: LatLng = LAUNCH_PRESETS.length > 0
    ? LAUNCH_PRESETS[Math.floor(Math.random() * LAUNCH_PRESETS.length)]!
    : randomFarOrigin(contact, 40);

  const speedKmh = shahedType.typicalSpeedKmh || 180;
  const etaSec = (1.5 + Math.random() * 1.5) * 60;
  const totalKm = haversineKm(origin, contact);
  const distFromContactKm = Math.min(totalKm, (etaSec / 3600) * speedKmh);
  const tBack = totalKm > 0 ? distFromContactKm / totalKm : 0;
  const currentPos: LatLng = {
    lat: contact.lat + (origin.lat - contact.lat) * tBack,
    lng: contact.lng + (origin.lng - contact.lng) * tBack,
  };

  const descentPhaseM = shahedType.descentPhaseM ?? 500;
  const descentPhaseKm = descentPhaseM / 1000;
  const hasCruise = distFromContactKm > descentPhaseKm;
  const attackLegKm = Math.min(descentPhaseKm, distFromContactKm);
  const attackStartT = distFromContactKm > 0 ? attackLegKm / distFromContactKm : 0;
  const attackStart: LatLng = {
    lat: contact.lat + (currentPos.lat - contact.lat) * attackStartT,
    lng: contact.lng + (currentPos.lng - contact.lng) * attackStartT,
  };

  return {
    typeId: shahedType._id,
    code: `DEMO-${Math.floor(100 + Math.random() * 900)}`,
    position: currentPos,
    altitudeM: shahedType.typicalAltitudeM.max,
    speedKmh,
    descentPhaseM,
    geometry: {
      pastPath: [origin, currentPos],
      futureCruise: hasCruise ? [currentPos, attackStart] : null,
      futureAttack: hasCruise ? [attackStart, contact] : [currentPos, contact],
      detonation: { lat: contact.lat, lng: contact.lng, radiusM: 180 },
      divergence: null,
    },
  };
}
