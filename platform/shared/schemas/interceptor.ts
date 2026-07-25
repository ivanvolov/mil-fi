import { z } from 'zod';
import { baseFields, LatLng, ObjectIdString } from './common.js';

export const InterceptorState = z.enum(['ready', 'reload', 'offline']);
export type InterceptorState = z.infer<typeof InterceptorState>;

export const InterceptorAmmo = z.object({
  ready: z.number().int().nonnegative(),
  reload: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  reloadEtaSec: z.number().int().nonnegative().nullable(),
});

export const InterceptorConstraints = z.object({
  wind: z.string().nullable(),
  visibility: z.string().nullable(),
  daylight: z.boolean().nullable(),
});

export const InterceptorBody = z.object({
  layerId: ObjectIdString,
  typeId: ObjectIdString,
  code: z.string().min(1).max(40),
  /** Battlefield-wide code — generated once on creation, unique, never user-edited. */
  battlefieldCode: z.string().max(40),
  position: LatLng,
  state: InterceptorState,
  ammo: InterceptorAmmo.nullable(),
  constraints: InterceptorConstraints.nullable(),
});

export const Interceptor = z.object({ ...baseFields }).and(InterceptorBody);

// battlefieldCode is optional on create — the server generates one when omitted.
export const InterceptorCreate = InterceptorBody.omit({ layerId: true, battlefieldCode: true }).extend({
  battlefieldCode: z.string().max(40).optional(),
});
export const InterceptorPatch = InterceptorBody.omit({ layerId: true }).partial();
export const InterceptorPositionPatch = z.object({ position: LatLng });

export type Interceptor = z.infer<typeof Interceptor>;
export type InterceptorCreate = z.infer<typeof InterceptorCreate>;
export type InterceptorPatch = z.infer<typeof InterceptorPatch>;
export type InterceptorPositionPatch = z.infer<typeof InterceptorPositionPatch>;
