import { z } from 'zod';
import { baseFields, LatLng, ObjectIdString } from './common.js';

export const TeamBody = z.object({
  layerId: ObjectIdString,
  code: z.string().min(1).max(40),
  /** Battlefield-wide code — generated once on creation, unique, never user-edited. */
  battlefieldCode: z.string().max(40),
  position: LatLng,
  role: z.string().max(500),
  isElite: z.boolean(),
});

export const Team = z.object({ ...baseFields }).and(TeamBody);

// battlefieldCode is optional on create — the server generates one when omitted.
export const TeamCreate = TeamBody.omit({ layerId: true, battlefieldCode: true }).extend({
  battlefieldCode: z.string().max(40).optional(),
});
export const TeamPatch = TeamBody.omit({ layerId: true }).partial();
export const TeamPositionPatch = z.object({ position: LatLng });

export type Team = z.infer<typeof Team>;
export type TeamCreate = z.infer<typeof TeamCreate>;
export type TeamPatch = z.infer<typeof TeamPatch>;
export type TeamPositionPatch = z.infer<typeof TeamPositionPatch>;
