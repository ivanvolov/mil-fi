import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import { ThreadCreate, ThreadBulk } from '@shared/schemas/thread';
import { getOperator, HttpError, softDelete } from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';

export async function registerThreadRoutes(app: FastifyInstance, c: Collections) {
  app.get<{ Params: { layerId: string } }>('/layers/:layerId/threads', async (req) => {
    const docs = await c.threads.find({ layerId: new ObjectId(req.params.layerId), deletedAt: null }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/threads',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = ThreadCreate.parse(req.body);
      // sanity: layer exists, team & interceptor exist + belong to this layer
      const [team, inter] = await Promise.all([
        c.teams.findOne({ _id: new ObjectId(body.teamId), layerId, deletedAt: null }),
        c.interceptors.findOne({ _id: new ObjectId(body.interceptorId), layerId, deletedAt: null }),
      ]);
      if (!team) throw new HttpError(400, 'BAD_TEAM', 'team not found in this layer');
      if (!inter) throw new HttpError(400, 'BAD_INTERCEPTOR', 'interceptor not found in this layer');
      const existing = await c.threads.findOne({
        layerId,
        teamId: team._id,
        interceptorId: inter._id,
        deletedAt: null,
      });
      if (existing) return reply.code(409).send({ code: 'DUPLICATE', message: 'thread already exists', existingId: existing._id.toHexString() });
      const doc = {
        _id: new ObjectId(),
        layerId,
        teamId: team._id,
        interceptorId: inter._id,
        kind: body.kind,
        updatedBy: getOperator(req),
        ...newTimestamps(),
      };
      await c.threads.insertOne(doc as any);
      reply.code(201);
      return serializeDoc(doc);
    },
  );

  app.delete<{ Params: { layerId: string; id: string } }>(
    '/layers/:layerId/threads/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const r = await softDelete(c.threads, { _id: id, layerId, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'thread not found' });
      return { ok: true };
    },
  );

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/threads/bulk',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = ThreadBulk.parse(req.body);
      const operator = getOperator(req);

      const createDocs = await Promise.all(
        body.create.map(async (t) => {
          const [team, inter] = await Promise.all([
            c.teams.findOne({ _id: new ObjectId(t.teamId), layerId, deletedAt: null }),
            c.interceptors.findOne({ _id: new ObjectId(t.interceptorId), layerId, deletedAt: null }),
          ]);
          if (!team || !inter) return null;
          const dup = await c.threads.findOne({ layerId, teamId: team._id, interceptorId: inter._id, deletedAt: null });
          if (dup) return null;
          return {
            _id: new ObjectId(),
            layerId,
            teamId: team._id,
            interceptorId: inter._id,
            kind: t.kind,
            updatedBy: operator,
            ...newTimestamps(),
          };
        }),
      );
      const goodCreates = createDocs.filter((d): d is NonNullable<typeof d> => d !== null);
      if (goodCreates.length > 0) await c.threads.insertMany(goodCreates as any);

      if (body.deleteIds.length > 0) {
        await c.threads.updateMany(
          { layerId, _id: { $in: body.deleteIds.map((id) => new ObjectId(id)) }, deletedAt: null },
          { $set: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: operator }, $inc: { version: 1 } },
        );
      }

      reply.code(200);
      return { created: serializeDocs(goodCreates), createdCount: goodCreates.length, deletedCount: body.deleteIds.length };
    },
  );
}
