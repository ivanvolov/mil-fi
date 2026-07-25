import { z } from 'zod';
import { baseFields, LatLng, ObjectIdString } from './common.js';

/** Divergence zone: a cosmetic rectangle around the detonation point conveying the
 *  predicted spread of the terminal track. `widthM`/`heightM` are the box dimensions
 *  (E-W / N-S). Purely a map annotation — algorithms do not read it. */
export const Divergence = z.object({
  widthM: z.number().nonnegative(),
  heightM: z.number().nonnegative(),
});

/** Default divergence zone — wider E-W than N-S, centered on the detonation point.
 *  Applied on creation when none is given, and backfilled onto existing threats by
 *  the boot migration so a detonation point is never missing its divergence box. */
export const DEFAULT_DIVERGENCE: z.infer<typeof Divergence> = { widthM: 3000, heightM: 1500 };

export const ThreatGeometry = z.object({
  pastPath: z.array(LatLng).nullable(),
  futureCruise: z.array(LatLng).nullable(),
  futureAttack: z.array(LatLng).nullable(),
  /** The target — where the threat is predicted to detonate. */
  detonation: z.object({ lat: z.number(), lng: z.number(), radiusM: z.number().nonnegative() }).nullable(),
  divergence: Divergence.nullable(),
});

export const ThreatBody = z.object({
  layerId: ObjectIdString,
  typeId: ObjectIdString,
  code: z.string().min(1).max(40),
  /** Battlefield-wide code — generated once on creation, unique, never user-edited. */
  battlefieldCode: z.string().max(40),
  position: LatLng,
  altitudeM: z.number().nonnegative(),
  speedKmh: z.number().nonnegative(),
  /** Terminal descent-phase length (m). Individual to the drone; defaults from its type (500). */
  descentPhaseM: z.number().nonnegative().default(500),
  geometry: ThreatGeometry,
});

export const Threat = z.object({ ...baseFields }).and(ThreatBody);

// Creation omits the layer (in the URL) and the battlefield code (server-generated).
// descentPhaseM is optional here so the server can fall back to the threat type's default.
export const ThreatCreate = ThreatBody.omit({ layerId: true, battlefieldCode: true, descentPhaseM: true }).extend({
  battlefieldCode: z.string().max(40).optional(),
  descentPhaseM: z.number().nonnegative().optional(),
});
export const ThreatPatch = ThreatBody.omit({ layerId: true }).partial();
export const ThreatGeometryPatch = z.object({ geometry: ThreatGeometry, position: LatLng.optional() });

export type Divergence = z.infer<typeof Divergence>;
export type Threat = z.infer<typeof Threat>;
export type ThreatCreate = z.infer<typeof ThreatCreate>;
export type ThreatPatch = z.infer<typeof ThreatPatch>;
export type ThreatGeometryPatch = z.infer<typeof ThreatGeometryPatch>;
