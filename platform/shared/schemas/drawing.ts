import { z } from 'zod';
import { baseFields, LatLng, ObjectIdString } from './common.js';

export const DrawingKind = z.enum(['noFlyZone', 'noEngagementZone', 'noPlacementZone', 'sensorCoverage', 'custom']);
export type DrawingKind = z.infer<typeof DrawingKind>;

export const DrawingGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('polygon'), points: z.array(LatLng).min(3) }),
  z.object({ type: z.literal('circle'), center: LatLng, radiusM: z.number().positive() }),
  z.object({ type: z.literal('rectangle'), sw: LatLng, ne: LatLng }),
]);

export const DrawingStyle = z.object({
  stroke: z.string().nullable(),
  fill: z.string().nullable(),
  patternId: z.string().nullable(),
  weight: z.number().nonnegative().nullable(),
  dashArray: z.string().nullable(),
});

export const DrawingBody = z.object({
  layerId: ObjectIdString,
  kind: DrawingKind,
  name: z.string().max(120).nullable(),
  geometry: DrawingGeometry,
  style: DrawingStyle.nullable(),
  visible: z.boolean(),
});

export const Drawing = z.object({ ...baseFields }).and(DrawingBody);

export const DrawingCreate = DrawingBody.omit({ layerId: true });
export const DrawingPatch = DrawingBody.omit({ layerId: true }).partial();

export type Drawing = z.infer<typeof Drawing>;
export type DrawingCreate = z.infer<typeof DrawingCreate>;
export type DrawingPatch = z.infer<typeof DrawingPatch>;
