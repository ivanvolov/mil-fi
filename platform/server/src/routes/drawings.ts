import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import { DrawingCreate, DrawingPatch } from '@shared/schemas/drawing';
import { getOperator, HttpError, patchDoc, readIfMatch, softDelete } from '../lib/crud.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';

export async function registerDrawingRoutes(app: FastifyInstance, c: Collections) {
  app.get<{ Params: { layerId: string } }>('/layers/:layerId/drawings', async (req) => {
    const docs = await c.drawings.find({ layerId: new ObjectId(req.params.layerId), deletedAt: null }).toArray();
    return serializeDocs(docs);
  });

  app.post<{ Params: { layerId: string }; Body: unknown }>(
    '/layers/:layerId/drawings',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const body = DrawingCreate.parse(req.body);
      const layer = await c.layers.findOne({ _id: layerId, deletedAt: null });
      if (!layer) throw new HttpError(404, 'NOT_FOUND', 'layer not found');
      const doc = {
        _id: new ObjectId(),
        layerId,
        kind: body.kind,
        name: body.name,
        geometry: body.geometry,
        style: body.style,
        visible: body.visible,
        updatedBy: getOperator(req),
        ...newTimestamps(),
      };
      await c.drawings.insertOne(doc as any);
      reply.code(201);
      return serializeDoc(doc);
    },
  );

  app.patch<{ Params: { layerId: string; id: string }; Body: unknown }>(
    '/layers/:layerId/drawings/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const patch = DrawingPatch.parse(req.body) as Record<string, unknown>;
      const expectedVersion = readIfMatch(req);
      const r = await patchDoc(c.drawings, { _id: id, layerId, deletedAt: null }, patch, expectedVersion, { operator: getOperator(req) });
      if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'drawing not found' });
      if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
      reply.header('ETag', `"${r.doc.version}"`);
      return serializeDoc(r.doc);
    },
  );

  app.delete<{ Params: { layerId: string; id: string } }>(
    '/layers/:layerId/drawings/:id',
    async (req, reply) => {
      const layerId = new ObjectId(req.params.layerId);
      const id = new ObjectId(req.params.id);
      const r = await softDelete(c.drawings, { _id: id, layerId, deletedAt: null }, { operator: getOperator(req) });
      if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'drawing not found' });
      return { ok: true };
    },
  );
}
