import { z } from 'zod';
import { baseFields, LatLng } from './common.js';

export const LayerKind = z.enum(['sector']);
export type LayerKind = z.infer<typeof LayerKind>;

export const LayerBody = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'slug must be lowercase-kebab'),
  description: z.string().max(2000).nullable(),
  mapCenter: LatLng,
  mapZoom: z.number().int().min(1).max(20),
  isActive: z.boolean(),
  kind: LayerKind,
  /** Hidden sectors are kept in the DB and reachable by direct slug URL, but
   *  excluded from GET /layers listings (and therefore the sector switcher). */
  hidden: z.boolean().optional(),
});

export const Layer = z.object({ ...baseFields }).and(LayerBody);

export const LayerCreate = LayerBody.partial({ isActive: true, kind: true }).extend({
  isActive: z.boolean().optional(),
  kind: LayerKind.optional(),
});

export const LayerPatch = LayerBody.partial();

export type Layer = z.infer<typeof Layer>;
export type LayerCreate = z.infer<typeof LayerCreate>;
export type LayerPatch = z.infer<typeof LayerPatch>;
