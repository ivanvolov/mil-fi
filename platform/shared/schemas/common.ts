import { z } from 'zod';

export const ObjectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'invalid ObjectId');
export type ObjectIdString = z.infer<typeof ObjectIdString>;

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const IsoDateString = z.string().datetime({ offset: true });

export const Timestamps = z.object({
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
  version: z.number().int().nonnegative(),
});

export const baseFields = {
  _id: ObjectIdString,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
  version: z.number().int().nonnegative(),
};
