import { z } from 'zod';
import { baseFields } from './common.js';

export const InterceptorCategory = z.enum(['interceptor', 'mfg', 'manpads']);
export type InterceptorCategory = z.infer<typeof InterceptorCategory>;

export const InterceptorEnvelope = z.object({
  rangeKm: z.number().positive().max(500),
  altMaxM: z.number().positive().max(40000),
  spdMaxKmh: z.number().positive().max(10000),
});

export const InterceptorLoadout = z.object({
  hasReload: z.boolean(),
  defaultCapacity: z.number().int().nonnegative(),
  defaultReloadSec: z.number().int().nonnegative(),
});

export const InterceptorTypeBody = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'key must be lowercase-kebab'),
  displayName: z.string().min(1).max(120),
  category: InterceptorCategory,
  requiresCrew: z.boolean(),
  envelope: InterceptorEnvelope,
  loadout: InterceptorLoadout,
  notes: z.string().max(2000).nullable(),
});

export const InterceptorType = z.object({
  ...baseFields,
}).and(InterceptorTypeBody);

export const InterceptorTypeCreate = InterceptorTypeBody;
// note: envelope/loadout are FULL objects when present — Mongo $set on a subdoc replaces it,
// so partial nested updates would silently wipe sibling fields.
export const InterceptorTypePatch = z.object({
  displayName: z.string().min(1).max(120).optional(),
  category: InterceptorCategory.optional(),
  requiresCrew: z.boolean().optional(),
  envelope: InterceptorEnvelope.optional(),
  loadout: InterceptorLoadout.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type InterceptorType = z.infer<typeof InterceptorType>;
export type InterceptorTypeCreate = z.infer<typeof InterceptorTypeCreate>;
export type InterceptorTypePatch = z.infer<typeof InterceptorTypePatch>;
