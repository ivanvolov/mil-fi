import { z } from 'zod';
import { baseFields } from './common.js';

export const ThreatFamily = z.enum(['piston', 'jet', 'decoy', 'cruise', 'ballistic', 'other']);
export type ThreatFamily = z.infer<typeof ThreatFamily>;

export const ThreatTypeBody = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'key must be lowercase-kebab'),
  displayName: z.string().min(1).max(120),
  family: ThreatFamily,
  typicalSpeedKmh: z.number().nonnegative(),
  typicalAltitudeM: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }),
  warheadKg: z.number().nonnegative().nullable(),
  /** Default terminal descent-phase length (m) for drones of this type. */
  descentPhaseM: z.number().nonnegative().default(500),
  notes: z.string().max(2000).nullable(),
});

export const ThreatType = z.object({
  ...baseFields,
}).and(ThreatTypeBody);

export const ThreatTypeCreate = ThreatTypeBody;
export const ThreatTypePatch = ThreatTypeBody.partial();

export type ThreatType = z.infer<typeof ThreatType>;
export type ThreatTypeCreate = z.infer<typeof ThreatTypeCreate>;
export type ThreatTypePatch = z.infer<typeof ThreatTypePatch>;
