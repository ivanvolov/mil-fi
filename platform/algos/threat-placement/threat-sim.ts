import type { LatLng } from '@shared/schemas/common';

const METERS_PER_LAT_DEG = 111320;

function metersPerLngDeg(lat: number): number {
  return METERS_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180);
}

/** Bearing 0° = north (geographic convention), clockwise. Converts to math angle (radians)
 *  where 0 = east, increasing CCW, used by sin/cos for lat/lng offsets. */
function bearingDegToMathRad(bearingDeg: number): number {
  return ((90 - bearingDeg) * Math.PI) / 180;
}

/** Offset a center by a distance (meters) along a geographic bearing (degrees from north). */
function offsetMeters(center: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const rad = bearingDegToMathRad(bearingDeg);
  const dx = distanceM * Math.cos(rad); // east-west component
  const dy = distanceM * Math.sin(rad); // north-south component
  return {
    lat: center.lat + dy / METERS_PER_LAT_DEG,
    lng: center.lng + dx / metersPerLngDeg(center.lat),
  };
}

/** Normalize an angle to [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Sweep size from angleFrom to angleTo going clockwise. Wraps through 360 if angleTo < angleFrom. */
function sweepDeg(angleFromDeg: number, angleToDeg: number): number {
  const a = norm360(angleFromDeg);
  const b = norm360(angleToDeg);
  const d = b - a;
  return d === 0 ? 360 : ((d % 360) + 360) % 360;
}

/** Pie-sector polygon (center → arc samples → center). Suitable for L.polygon. */
export function piePolygonPoints(
  center: LatLng,
  radiusKm: number,
  angleFromDeg: number,
  angleToDeg: number,
): LatLng[] {
  const sweep = sweepDeg(angleFromDeg, angleToDeg);
  const radiusM = radiusKm * 1000;
  // ~3° resolution; clamp so we never produce zero segments for tiny sweeps
  const segments = Math.max(8, Math.ceil(sweep / 3));
  const pts: LatLng[] = [];
  if (sweep < 360) pts.push(center);
  for (let i = 0; i <= segments; i++) {
    const bearing = norm360(angleFromDeg + (sweep * i) / segments);
    pts.push(offsetMeters(center, radiusM, bearing));
  }
  if (sweep < 360) pts.push(center);
  return pts;
}

/** Uniform-area random sample inside the pie sector. */
export function randomContactInSector(
  center: LatLng,
  radiusKm: number,
  angleFromDeg: number,
  angleToDeg: number,
): LatLng {
  const sweep = sweepDeg(angleFromDeg, angleToDeg);
  const bearing = norm360(angleFromDeg + Math.random() * sweep);
  // sqrt for uniform area distribution (avoids bunching at center)
  const distM = Math.sqrt(Math.random()) * radiusKm * 1000;
  return offsetMeters(center, distM, bearing);
}
