import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import { ThreatCreate, ThreatPatch, ThreatGeometryPatch, DEFAULT_DIVERGENCE } from '@shared/schemas/threat';
import { getOperator, patchDoc, readIfMatch, softDelete, HttpError } from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';
import { generateBattlefieldCode } from '../lib/battlefieldCode.js';

export async function registerThreatRoutes(app: FastifyInstance, c: Collections) {
  app.get<{ Params: { layerId: string } }>('/layers/:layerId/threats', async (req) => {
    const docs = await c.threats.find({ layerId: new ObjectId(req.params.layerId), deletedAt: null }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/threats',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = ThreatCreate.parse(req.body);
      const layer = await c.layers.findOne({ _id: layerId, deletedAt: null });
      if (!layer) throw new HttpError(404, 'NOT_FOUND', 'layer not found');
      const type = await c.threatTypes.findOne({ _id: new ObjectId(body.typeId), deletedAt: null });
      const geometry = { ...body.geometry };
      if (geometry.divergence == null && geometry.detonation) {
        geometry.divergence = { ...DEFAULT_DIVERGENCE };
      }
      const doc = {
        _id: new ObjectId(),
        layerId,
        typeId: new ObjectId(body.typeId),
        code: body.code,
        battlefieldCode: body.battlefieldCode || generateBattlefieldCode(),
        position: body.position,
        altitudeM: body.altitudeM,
        speedKmh: body.speedKmh,
        descentPhaseM: body.descentPhaseM ?? (type as any)?.descentPhaseM ?? 500,
        geometry,
        updatedBy: getOperator(req),
        ...newTimestamps(),
      };
      await c.threats.insertOne(doc as any);
      reply.code(201);
      return serializeDoc(doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/threats/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const patch = ThreatPatch.parse(req.body) as Record<string, unknown>;
      if (patch.typeId && typeof patch.typeId === 'string') patch.typeId = new ObjectId(patch.typeId);
      const expectedVersion = readIfMatch(req);
      const r = await patchDoc(c.threats, { _id: id, layerId, deletedAt: null }, patch, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'threat not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/threats/:id/geometry',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const body = ThreatGeometryPatch.parse(req.body);
      const expectedVersion = readIfMatch(req);
      const setPatch: Record<string, unknown> = { geometry: body.geometry };
      if (body.position) setPatch.position = body.position;
      const r = await patchDoc(c.threats, { _id: id, layerId, deletedAt: null }, setPatch, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'threat not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.delete<{ Params: { layerId: string; id: string } }>(
    '/layers/:layerId/threats/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const r = await softDelete(c.threats, { _id: id, layerId, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'threat not found' });
      return { ok: true };
    },
  );
}
