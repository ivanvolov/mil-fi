import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Collections } from '../db.js';
import {
  InterceptorTypeCreate,
  InterceptorTypePatch,
} from '@shared/schemas/interceptor-type';
import {
  ThreatTypeCreate,
  ThreatTypePatch,
} from '@shared/schemas/threat-type';
import { getOperator, patchDoc, readIfMatch, softDelete, HttpError } from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';

const ConfirmedTypePatch = z.object({
  patch: z.record(z.unknown()),
  expectedAffectedCount: z.number().int().nonnegative(),
});

async function affectedInterceptorCount(c: Collections, typeId: ObjectId) {
  const rows = await c.interceptors
    .aggregate([
      { $match: { typeId, deletedAt: null } },
      { $group: { _id: '$layerId', count: { $sum: 1 } } },
    ])
    .toArray();
  const total = rows.reduce((s, r) => s + (r.count as number), 0);
  const layerIds = rows.map((r) => r._id as ObjectId);
  const layers = await c.layers.find({ _id: { $in: layerIds } }).toArray();
  const layerById = new Map(layers.map((l) => [l._id.toHexString(), l.name as string]));
  const layerBreakdown = rows.map((r) => ({
    layerId: (r._id as ObjectId).toHexString(),
    layerName: layerById.get((r._id as ObjectId).toHexString()) ?? '?',
    count: r.count as number,
  }));
  return { instanceCount: total, layerBreakdown };
}

async function affectedThreatCount(c: Collections, typeId: ObjectId) {
  const rows = await c.threats
    .aggregate([
      { $match: { typeId, deletedAt: null } },
      { $group: { _id: '$layerId', count: { $sum: 1 } } },
    ])
    .toArray();
  const total = rows.reduce((s, r) => s + (r.count as number), 0);
  const layerIds = rows.map((r) => r._id as ObjectId);
  const layers = await c.layers.find({ _id: { $in: layerIds } }).toArray();
  const layerById = new Map(layers.map((l) => [l._id.toHexString(), l.name as string]));
  const layerBreakdown = rows.map((r) => ({
    layerId: (r._id as ObjectId).toHexString(),
    layerName: layerById.get((r._id as ObjectId).toHexString()) ?? '?',
    count: r.count as number,
  }));
  return { instanceCount: total, layerBreakdown };
}

export async function registerTypeRoutes(app: FastifyInstance, c: Collections) {
  // -------- interceptor types --------
  app.get('/types/interceptors', async () => {
    const docs = await c.interceptorTypes.find({ deletedAt: null }).sort({ category: 1, displayName: 1 }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Body: unknown }>('/types/interceptors', async (req, reply) => {
    const body = InterceptorTypeCreate.parse(req.body);
    const doc = { _id: new ObjectId(), ...body, updatedBy: getOperator(req), ...newTimestamps() };
    await c.interceptorTypes.insertOne(doc as any);
    reply.code(201);
    return serializeDoc(doc);
  });

  app.get<{ Params: { id: string } }>('/types/interceptors/:id/affected', async (req) => {
    return affectedInterceptorCount(c, new ObjectId(req.params.id));
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/types/interceptors/:id',
    async (req, reply) => {
      const id = new ObjectId(req.params.id);
      const expectedVersion = readIfMatch(req);

      // Two paths: confirmed body (with expectedAffectedCount) OR plain patch (no instance impact gate).
      // We accept either, but require confirmation when the patch is non-empty AND there are referencing instances.
      let patch: Record<string, unknown>;
      let expectedAffected: number | undefined;
      const parsed = ConfirmedTypePatch.safeParse(req.body);
      if (parsed.success) {
        patch = parsed.data.patch;
        expectedAffected = parsed.data.expectedAffectedCount;
      } else {
        patch = InterceptorTypePatch.parse(req.body) as Record<string, unknown>;
      }

      const { instanceCount } = await affectedInterceptorCount(c, id);
      if (expectedAffected !== undefined && expectedAffected !== instanceCount) {
        return reply.code(409).send({
          code: 'AFFECTED_COUNT_CHANGED',
          message: 'instance count changed between dialog open and save',
          actualCount: instanceCount,
        });
      }

      const validated = InterceptorTypePatch.parse(patch);
      const r = await patchDoc(c.interceptorTypes, { _id: id, deletedAt: null }, validated as Record<string, unknown>, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'interceptor type not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/types/interceptors/:id',
    async (req, reply) => {
      const id = new ObjectId(req.params.id);
      const force = req.query.force === 'true';
      const affected = await affectedInterceptorCount(c, id);
      if (affected.instanceCount > 0 && !force) {
        return reply.code(409).send({ code: 'TYPE_IN_USE', message: 'type has referencing instances', ...affected });
      }
      const r = await softDelete(c.interceptorTypes, { _id: id, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'interceptor type not found' });
      return { ok: true, forced: force, affected };
    },
  );

  // -------- threat types --------
  app.get('/types/threats', async () => {
    const docs = await c.threatTypes.find({ deletedAt: null }).sort({ family: 1, displayName: 1 }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Body: unknown }>('/types/threats', async (req, reply) => {
    const body = ThreatTypeCreate.parse(req.body);
    const doc = { _id: new ObjectId(), ...body, updatedBy: getOperator(req), ...newTimestamps() };
    await c.threatTypes.insertOne(doc as any);
    reply.code(201);
    return serializeDoc(doc);
  });

  app.get<{ Params: { id: string } }>('/types/threats/:id/affected', async (req) => {
    return affectedThreatCount(c, new ObjectId(req.params.id));
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/types/threats/:id',
    async (req, reply) => {
      const id = new ObjectId(req.params.id);
      const expectedVersion = readIfMatch(req);

      let patch: Record<string, unknown>;
      let expectedAffected: number | undefined;
      const parsed = ConfirmedTypePatch.safeParse(req.body);
      if (parsed.success) {
        patch = parsed.data.patch;
        expectedAffected = parsed.data.expectedAffectedCount;
      } else {
        patch = ThreatTypePatch.parse(req.body) as Record<string, unknown>;
      }

      const { instanceCount } = await affectedThreatCount(c, id);
      if (expectedAffected !== undefined && expectedAffected !== instanceCount) {
        return reply.code(409).send({
          code: 'AFFECTED_COUNT_CHANGED',
          message: 'instance count changed between dialog open and save',
          actualCount: instanceCount,
        });
      }

      const validated = ThreatTypePatch.parse(patch);
      const r = await patchDoc(c.threatTypes, { _id: id, deletedAt: null }, validated as Record<string, unknown>, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'threat type not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/types/threats/:id',
    async (req, reply) => {
      const id = new ObjectId(req.params.id);
      const force = req.query.force === 'true';
      const affected = await affectedThreatCount(c, id);
      if (affected.instanceCount > 0 && !force) {
        return reply.code(409).send({ code: 'TYPE_IN_USE', message: 'type has referencing instances', ...affected });
      }
      const r = await softDelete(c.threatTypes, { _id: id, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'threat type not found' });
      return { ok: true, forced: force, affected };
    },
  );
}
