import { z } from 'zod';
import { baseFields, ObjectIdString } from './common.js';

export const ThreadKind = z.enum(['primary', 'override']);
export type ThreadKind = z.infer<typeof ThreadKind>;

export const ThreadBody = z.object({
  layerId: ObjectIdString,
  teamId: ObjectIdString,
  interceptorId: ObjectIdString,
  kind: ThreadKind,
});

export const Thread = z.object({ ...baseFields }).and(ThreadBody);

export const ThreadCreate = ThreadBody.omit({ layerId: true });
export const ThreadBulk = z.object({
  create: z.array(ThreadCreate).default([]),
  deleteIds: z.array(ObjectIdString).default([]),
});

export type Thread = z.infer<typeof Thread>;
export type ThreadCreate = z.infer<typeof ThreadCreate>;
export type ThreadBulk = z.infer<typeof ThreadBulk>;
