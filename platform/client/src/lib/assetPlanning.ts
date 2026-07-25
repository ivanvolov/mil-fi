import type { LatLng } from '@shared/schemas/common';
import type { Drawing } from '@shared/schemas/drawing';
import type { Threat } from '@shared/schemas/threat';
import type { ThreatType } from '@shared/schemas/threat-type';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { latLngRingToKm, type ExclusionPolygonKm } from '@algos/placement/placement-common';

const KM_PER_LAT_DEG = 111.32;

/** Any drawing geometry → an outer ring of LatLng points. Circles are sampled at 48 vertices
 *  (dense enough that the ray-cast in-polygon test tracks the disk within a few percent).
 *  Rectangles become a 4-vertex ring. Polygons pass through. */
export function geometryToLatLngRing(g: Drawing['geometry']): LatLng[] {
  if (g.type === 'polygon') return g.points;
  if (g.type === 'rectangle') {
    const { sw, ne } = g;
    return [
      { lat: sw.lat, lng: sw.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: ne.lat, lng: ne.lng },
      { lat: ne.lat, lng: sw.lng },
    ];
  }
  const { center, radiusM } = g;
  const N = 48;
  const kmPerLng = KM_PER_LAT_DEG * Math.cos((center.lat * Math.PI) / 180) || KM_PER_LAT_DEG;
  const rKm = radiusM / 1000;
  const ring: LatLng[] = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI;
    const dxKm = rKm * Math.sin(theta);
    const dyKm = rKm * Math.cos(theta);
    ring.push({
      lat: center.lat + dyKm / KM_PER_LAT_DEG,
      lng: center.lng + dxKm / kmPerLng,
    });
  }
  return ring;
}

/** No-placement-zone drawings → exclusion rings in the local km-frame centered on `center`.
 *  NPZ is a rule, not a display toggle, so hidden zones count too. */
export function npzRingsKm(drawings: Drawing[], center: LatLng): ExclusionPolygonKm[] {
  return drawings
    .filter((d) => d.kind === 'noPlacementZone')
    .map((d) => latLngRingToKm(center, geometryToLatLngRing(d.geometry)));
}

/** Donut thickness = terminal descent length (km), resolved from the threat TYPE (single source of
 *  truth) via each threat's `typeId` — so editing a type's `descentPhaseM` in the catalog updates
 *  the donut for every threat of that type, no re-simulation. Uses the max across the types in play
 *  (worst case); with no threats on the map, the max across all threat types; else a 500 m default. */
const DEFAULT_DESCENT_KM = 0.5;
export function currentDescentLengthKm(threats: Threat[], threatTypes: ThreatType[]): number {
  const typeById = new Map(threatTypes.map((t) => [t._id, t]));
  let maxM = 0;
  for (const t of threats) {
    const m = typeById.get(t.typeId)?.descentPhaseM ?? 0;
    if (m > maxM) maxM = m;
  }
  if (maxM <= 0) {
    for (const ty of threatTypes) {
      const m = ty.descentPhaseM ?? 0;
      if (m > maxM) maxM = m;
    }
  }
  const km = maxM / 1000;
  return km > 0 ? km : DEFAULT_DESCENT_KM;
}

/** Widest MFG range in the inventory — used to size the diagnostic donut heatmap. 0 if no MFG. */
export function maxMfgRangeKm(types: InterceptorType[]): number {
  let m = 0;
  for (const t of types) if (t.category === 'mfg') m = Math.max(m, t.envelope.rangeKm);
  return m;
}
