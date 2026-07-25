import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import { TeamCreate, TeamPatch, TeamPositionPatch } from '@shared/schemas/team';
import { getOperator, patchDoc, readIfMatch, softDelete, HttpError } from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';
import { generateBattlefieldCode } from '../lib/battlefieldCode.js';

export async function registerTeamRoutes(app: FastifyInstance, c: Collections) {
  app.get<{ Params: { layerId: string } }>('/layers/:layerId/teams', async (req) => {
    const docs = await c.teams.find({ layerId: new ObjectId(req.params.layerId), deletedAt: null }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/teams',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = TeamCreate.parse(req.body);
      const layer = await c.layers.findOne({ _id: layerId, deletedAt: null });
      if (!layer) throw new HttpError(404, 'NOT_FOUND', 'layer not found');
      const doc = {
        _id: new ObjectId(),
        layerId,
        code: body.code,
        battlefieldCode: body.battlefieldCode || generateBattlefieldCode(),
        position: body.position,
        role: body.role,
        isElite: body.isElite,
        updatedBy: getOperator(req),
        ...newTimestamps(),
      };
      await c.teams.insertOne(doc as any);
      reply.code(201);
      return serializeDoc(doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/teams/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const patch = TeamPatch.parse(req.body);
      const expectedVersion = readIfMatch(req);
      const r = await patchDoc(c.teams, { _id: id, layerId, deletedAt: null }, patch as Record<string, unknown>, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'team not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/teams/:id/position',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const body = TeamPositionPatch.parse(req.body);
      const expectedVersion = readIfMatch(req);
      const r = await patchDoc(c.teams, { _id: id, layerId, deletedAt: null }, { position: body.position }, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'team not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.delete<{ Params: { layerId: string; id: string } }>(
    '/layers/:layerId/teams/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const r = await softDelete(c.teams, { _id: id, layerId, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'team not found' });
      // cascade soft-delete threads owned by this team
      await c.threads.updateMany(
        { teamId: id, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedBy: getOperator(req), updatedAt: new Date() }, $inc: { version: 1 } },
      );
      return { ok: true };
    },
  );
}
