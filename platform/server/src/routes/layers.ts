import type { FastifyInstance } from 'fastify';
import type { Collections } from '../db.js';
import { newTimestamps, serializeDoc, serializeDocs } from '../lib/doc.js';
import { ObjectId } from 'mongodb';
import { LayerCreate, LayerKind, LayerPatch } from '@shared/schemas/layer';
import { getOperator, HttpError, patchDoc, readIfMatch, softDelete } from '../lib/crud.js';

/** 8-char lowercase base36 slug. Server-side fallback for POST /layers/:id/duplicate when
 *  the client didn't supply one. Client normally generates its own via LayerSwitcher. */
function generateLayerSlug(): string {
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

export async function registerLayerRoutes(app: FastifyInstance, c: Collections) {
  // GET /layers[?kind=sector]
  //   No `kind` param: returns everything (unchanged behavior for legacy callers).
  //   With `kind=sector`: sectors + legacy rows with no `kind` (backfill runs at boot).
  app.get<{ Querystring: { kind?: string } }>('/layers', async (req) => {
    const kindRaw = req.query?.kind;
    const base: Record<string, unknown> = { deletedAt: null };
    let filter: Record<string, unknown> = base;
    if (kindRaw !== undefined) {
      LayerKind.parse(kindRaw); // validate — 'sector' is the only valid kind
      // Match sectors AND legacy rows that pre-date the discriminator.
      filter = { ...base, $or: [{ kind: 'sector' }, { kind: { $exists: false } }] };
    }
    const docs = await c.layers.find(filter as any).sort({ isActive: -1, name: 1 }).toArray();
    return serializeDocs(docs);
  });

  app.get<{ Params: { slug: string } }>('/layers/:slug/full', async (req, reply) => {
    const layer = await c.layers.findOne({ slug: req.params.slug, deletedAt: null });
    if (!layer) return reply.status(404).send({ code: 'NOT_FOUND', message: `layer '${req.params.slug}' not found` });

    const layerId = layer._id as ObjectId;
    const [interceptors, threats, teams, threads, drawings, interceptorTypes, threatTypes] = await Promise.all([
      c.interceptors.find({ layerId, deletedAt: null }).toArray(),
      c.threats.find({ layerId, deletedAt: null }).toArray(),
      c.teams.find({ layerId, deletedAt: null }).toArray(),
      c.threads.find({ layerId, deletedAt: null }).toArray(),
      c.drawings.find({ layerId, deletedAt: null }).toArray(),
      c.interceptorTypes.find({ deletedAt: null }).toArray(),
      c.threatTypes.find({ deletedAt: null }).toArray(),
    ]);

    return {
      layer: serializeDoc(layer),
      types: {
        interceptor: serializeDocs(interceptorTypes),
        threat: serializeDocs(threatTypes),
      },
      interceptors: serializeDocs(interceptors),
      threats: serializeDocs(threats),
      teams: serializeDocs(teams),
      threads: serializeDocs(threads),
      drawings: serializeDocs(drawings),
    };
  });

  app.post<{ Body: unknown }>('/layers', async (req, reply) => {
    const body = LayerCreate.parse(req.body);
    if (!body.name || !body.slug || !body.mapCenter || body.mapZoom == null) {
      throw new HttpError(400, 'BAD_LAYER', 'name, slug, mapCenter, mapZoom required');
    }
    const dup = await c.layers.findOne({ slug: body.slug, deletedAt: null });
    if (dup) return reply.code(409).send({ code: 'DUPLICATE_SLUG', message: 'slug already used' });
    const doc = {
      _id: new ObjectId(),
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      mapCenter: body.mapCenter,
      mapZoom: body.mapZoom,
      isActive: body.isActive ?? false,
      kind: body.kind ?? 'sector',
      updatedBy: getOperator(req),
      ...newTimestamps(),
    };
    await c.layers.insertOne(doc as any);
    reply.code(201);
    return serializeDoc(doc);
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/layers/:id', async (req, reply) => {
    const id = new ObjectId(req.params.id);
    const patch = LayerPatch.parse(req.body) as Record<string, unknown>;
    const expectedVersion = readIfMatch(req);
    const r = await patchDoc(c.layers, { _id: id, deletedAt: null }, patch, expectedVersion, { operator: getOperator(req) });
    if (r.status === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'layer not found' });
    if (r.status === 'stale') return reply.code(409).send({ code: 'STALE', message: 'version mismatch', currentVersion: r.currentVersion });
    reply.header('ETag', `"${r.doc.version}"`);
    return serializeDoc(r.doc);
  });

  app.delete<{ Params: { id: string } }>('/layers/:id', async (req, reply) => {
    const id = new ObjectId(req.params.id);
    const existing = await c.layers.findOne({ _id: id, deletedAt: null });
    if (!existing) return reply.code(404).send({ code: 'NOT_FOUND', message: 'layer not found' });

    const r = await softDelete(c.layers, { _id: id, deletedAt: null }, { operator: getOperator(req) });
    if (r === 'not_found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'layer not found' });

    const now = new Date();
    const operator = getOperator(req);
    const cascadeUpdate = { $set: { deletedAt: now, updatedAt: now, updatedBy: operator }, $inc: { version: 1 } } as any;

    await Promise.all([
      c.interceptors.updateMany({ layerId: id, deletedAt: null }, cascadeUpdate),
      c.threats.updateMany({ layerId: id, deletedAt: null }, cascadeUpdate),
      c.teams.updateMany({ layerId: id, deletedAt: null }, cascadeUpdate),
      c.threads.updateMany({ layerId: id, deletedAt: null }, cascadeUpdate),
      c.drawings.updateMany({ layerId: id, deletedAt: null }, cascadeUpdate),
    ]);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { name?: string; slug?: string } }>(
    '/layers/:id/duplicate',
    async (req, reply) => {
      const sourceId = new ObjectId(req.params.id);
      const source = await c.layers.findOne({ _id: sourceId, deletedAt: null });
      if (!source) return reply.code(404).send({ code: 'NOT_FOUND', message: 'source layer not found' });

      const baseName = req.body?.name ?? `${source.name} (copy)`;
      // Client normally supplies a fresh uuid-style slug. If it doesn't, generate one
      // ourselves — never derive from `source.slug`, or duplicates cascade into
      // `foo-copy-copy-copy`. 8-char lowercase base36; retry on the astronomically
      // unlikely collision.
      let slug = req.body?.slug ?? generateLayerSlug();
      for (let attempt = 0; attempt < 20; attempt++) {
        const dup = await c.layers.findOne({ slug, deletedAt: null });
        if (!dup) break;
        slug = generateLayerSlug();
      }

      const newLayerId = new ObjectId();
      const operator = getOperator(req);
      await c.layers.insertOne({
        _id: newLayerId,
        name: baseName,
        slug,
        description: source.description,
        mapCenter: source.mapCenter,
        mapZoom: source.mapZoom,
        isActive: false,
        kind: 'sector',
        updatedBy: operator,
        ...newTimestamps(),
      } as any);

      // For each layer-scoped doc, generate a new _id, remap layerId, and rewrite cross-references.
      const interceptorMap = new Map<string, ObjectId>();
      const teamMap = new Map<string, ObjectId>();

      const interceptors = await c.interceptors.find({ layerId: sourceId, deletedAt: null }).toArray();
      for (const i of interceptors) interceptorMap.set((i._id as ObjectId).toHexString(), new ObjectId());
      if (interceptors.length > 0) {
        await c.interceptors.insertMany(
          interceptors.map((i) => ({
            ...i,
            _id: interceptorMap.get((i._id as ObjectId).toHexString())!,
            layerId: newLayerId,
            updatedBy: operator,
            ...newTimestamps(),
          })) as any,
        );
      }

      const teams = await c.teams.find({ layerId: sourceId, deletedAt: null }).toArray();
      for (const t of teams) teamMap.set((t._id as ObjectId).toHexString(), new ObjectId());
      if (teams.length > 0) {
        await c.teams.insertMany(
          teams.map((t) => ({
            ...t,
            _id: teamMap.get((t._id as ObjectId).toHexString())!,
            layerId: newLayerId,
            updatedBy: operator,
            ...newTimestamps(),
          })) as any,
        );
      }

      const threatMap = new Map<string, ObjectId>();
      const threats = await c.threats.find({ layerId: sourceId, deletedAt: null }).toArray();
      for (const th of threats) threatMap.set((th._id as ObjectId).toHexString(), new ObjectId());
      if (threats.length > 0) {
        await c.threats.insertMany(
          threats.map((th) => ({
            ...th,
            _id: threatMap.get((th._id as ObjectId).toHexString())!,
            layerId: newLayerId,
            updatedBy: operator,
            ...newTimestamps(),
          })) as any,
        );
      }

      const threads = await c.threads.find({ layerId: sourceId, deletedAt: null }).toArray();
      if (threads.length > 0) {
        const remapped = threads
          .map((th) => {
            const newTeam = teamMap.get((th.teamId as ObjectId).toHexString());
            const newInter = interceptorMap.get((th.interceptorId as ObjectId).toHexString());
            if (!newTeam || !newInter) return null;
            return { ...th, _id: new ObjectId(), layerId: newLayerId, teamId: newTeam, interceptorId: newInter, updatedBy: operator, ...newTimestamps() };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (remapped.length > 0) await c.threads.insertMany(remapped as any);
      }

      const drawings = await c.drawings.find({ layerId: sourceId, deletedAt: null }).toArray();
      if (drawings.length > 0) {
        await c.drawings.insertMany(
          drawings.map((d) => ({ ...d, _id: new ObjectId(), layerId: newLayerId, updatedBy: operator, ...newTimestamps() })) as any,
        );
      }

      const layer = await c.layers.findOne({ _id: newLayerId });
      reply.code(201);
      return serializeDoc(layer!);
    },
  );
}
