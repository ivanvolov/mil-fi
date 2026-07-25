import type { Collection, Document, Filter, ObjectId } from 'mongodb';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newTimestamps, serializeDoc } from './doc.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Read If-Match header as a non-negative integer, or undefined if absent. */
export function readIfMatch(req: FastifyRequest): number | undefined {
  const raw = req.headers['if-match'];
  if (!raw) return undefined;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === undefined) return undefined;
  const cleaned = s.replace(/^"|"$/g, '');
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0) {
    throw new HttpError(400, 'BAD_IF_MATCH', `If-Match must be a non-negative integer, got '${s}'`);
  }
  return n;
}

/** Optimistic-concurrency PATCH: bumps version on every write. */
export async function patchDoc<T extends Document>(
  col: Collection<T>,
  filter: Filter<T>,
  patch: Record<string, unknown>,
  expectedVersion: number | undefined,
  audit: { operator: string | null },
): Promise<{ doc: T; status: 'updated' } | { status: 'stale'; currentVersion: number } | { status: 'not_found' }> {
  const existing = await col.findOne(filter);
  if (!existing) return { status: 'not_found' };
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { status: 'stale', currentVersion: existing.version };
  }
  const update = {
    $set: { ...patch, updatedAt: new Date(), updatedBy: audit.operator ?? null },
    $inc: { version: 1 },
  };
  const res = await col.findOneAndUpdate(filter, update as any, { returnDocument: 'after' });
  if (!res) return { status: 'not_found' };
  return { status: 'updated', doc: res as T };
}

/** Soft delete: sets deletedAt + bumps version. */
export async function softDelete<T extends Document>(
  col: Collection<T>,
  filter: Filter<T>,
  audit: { operator: string | null },
): Promise<'deleted' | 'not_found' | 'already_deleted'> {
  const doc = await col.findOne(filter);
  if (!doc) return 'not_found';
  if (doc.deletedAt) return 'already_deleted';
  await col.updateOne(filter, {
    $set: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: audit.operator ?? null },
    $inc: { version: 1 },
  } as any);
  return 'deleted';
}

export function getOperator(req: FastifyRequest): string | null {
  // Authenticated session is the source of truth — operator field reflects
  // who actually made the change, not what the client claimed.
  if (req.session?.label) return req.session.label;
  const raw = req.headers['x-operator'];
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export function sendDoc<T extends Document>(reply: FastifyReply, doc: T) {
  reply.header('ETag', `"${doc.version}"`);
  return reply.send(serializeDoc(doc));
}

export function staleResponse(currentVersion: number) {
  return {
    statusCode: 409,
    body: { code: 'STALE', message: 'document version mismatch', currentVersion },
  };
}

export function notFoundResponse(what: string) {
  return { statusCode: 404, body: { code: 'NOT_FOUND', message: `${what} not found` } };
}

export type AuditContext = { operator: string | null };

export type WithBase<T> = T & ReturnType<typeof newTimestamps> & { _id: ObjectId };
