import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import {
  InterceptorCreate,
  InterceptorPatch,
  InterceptorPositionPatch,
} from '@shared/schemas/interceptor';
import {
  getOperator,
  patchDoc,
  readIfMatch,
  softDelete,
  HttpError,
} from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';
import { generateBattlefieldCode } from '../lib/battlefieldCode.js';

export async function registerInterceptorRoutes(app: FastifyInstance, c: Collections) {
  app.get<{ Params: { layerId: string } }>('/layers/:layerId/interceptors', async (req) => {
    const docs = await c.interceptors
      .find({ layerId: new ObjectId(req.params.layerId), deletedAt: null })
      .toArray();
    return serializeDocs(docs);
  });

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/interceptors',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = InterceptorCreate.parse(req.body);
      const layer = await c.layers.findOne({ _id: layerId, deletedAt: null });
      if (!layer) throw new HttpError(404, 'NOT_FOUND', 'layer not found');
      const type = await c.interceptorTypes.findOne({ _id: new ObjectId(body.typeId), deletedAt: null });
      if (!type) throw new HttpError(400, 'BAD_TYPE', 'interceptor type not found');

      const doc = {
        _id: new ObjectId(),
        layerId,
        typeId: new ObjectId(body.typeId),
        code: body.code,
        battlefieldCode: body.battlefieldCode || generateBattlefieldCode(),
        position: body.position,
        state: body.state,
        ammo: body.ammo,
        constraints: body.constraints,
        updatedBy: getOperator(req),
        ...newTimestamps(),
      };
      await c.interceptors.insertOne(doc as any);
      reply.code(201);
      return serializeDoc(doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/interceptors/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const patch = InterceptorPatch.parse(req.body);
      const expectedVersion = readIfMatch(req);

      const setPatch: Record<string, unknown> = { ...patch };
      if (setPatch.typeId && typeof setPatch.typeId === 'string') {
        setPatch.typeId = new ObjectId(setPatch.typeId);
      }
      const result = await patchDoc(
        c.interceptors,
        { _id: id, layerId, deletedAt: null },
        setPatch,
        expectedVersion,
        { operator: getOperator(req) },
      );
      if (result.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'interceptor not found' });
      if (result.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: result.currentVersion });
      reply.header('ETag', `"${result.doc.version}"`);
      return serializeDoc(result.doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/interceptors/:id/position',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const body = InterceptorPositionPatch.parse(req.body);
      const expectedVersion = readIfMatch(req);

      const result = await patchDoc(
        c.interceptors,
        { _id: id, layerId, deletedAt: null },
        { position: body.position },
        expectedVersion,
        { operator: getOperator(req) },
      );
      if (result.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'interceptor not found' });
      if (result.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: result.currentVersion });
      reply.header('ETag', `"${result.doc.version}"`);
      return serializeDoc(result.doc);
    },
  );

  app.delete<{ Params: { layerId: string; id: string } }>(
    '/layers/:layerId/interceptors/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const r = await softDelete(c.interceptors, { _id: id, layerId, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'interceptor not found' });
      // cascade soft-delete its threads
      await c.threads.updateMany(
        { interceptorId: id, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedBy: getOperator(req), updatedAt: new Date() }, $inc: { version: 1 } },
      );
      return { ok: true };
    },
  );
}
