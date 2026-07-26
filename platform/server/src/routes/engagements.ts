import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Collections, SpotDoc } from '../db.js';
import { HttpError } from '../lib/crud.js';
import { config, hederaEnabled } from '../config.js';
import { onboardUnit, runEngagement, type UnitDoc } from '../services/engagement.js';
import { loadActiveRule, saveActiveRule } from '../services/settlementRule.js';
import { DEFAULT_RULE, payoutFor, type SettlementRule } from '../hedera/settle.js';
import { evidence, submitEvidence, readJournal, forEngagement } from '../hedera/journal.js';
import { defpointBalance, payDefpoint, unfreezeUnit } from '../hedera/token.js';
import { runAgentA } from '../verification/agents.js';
import type { AgentAVerdict } from '../verification/agents.js';

const ImageInput = z.union([
  z.object({ dataUrl: z.string() }),
  z.object({ base64: z.string(), mime: z.string().optional() }),
  z.object({ url: z.string().url() }),
]);

const OnboardBody = z.object({
  unitId: z.string().min(1).optional(),
  humanBackingLevel: z.enum(['government', 'spotter', 'military']),
  worldProof: z.unknown().optional(),
  worldNullifier: z.string().optional(),
  worldTier: z.number().int().min(0).max(3).optional(),
});

const RuleInput = z
  .object({
    minThreatConfidence: z.number().min(0).max(1),
    requireDestroyed: z.boolean(),
    minDestroyedConfidence: z.number().min(0).max(1),
    requireConsistent: z.boolean(),
    payout: z.number().int().positive(),
  })
  .optional();

const AuthorizationInput = z
  .object({
    engagementId: z.string(),
    amount: z.string(),
    currency: z.string(),
    humanId: z.string(),
    tier: z.number(),
    issuedAt: z.number(),
    expiresAt: z.number(),
    nonce: z.string(),
  })
  .optional();

const SpotBody = z.object({
  image: ImageInput,
  coords: z.object({ lat: z.number(), lon: z.number() }).optional(),
  note: z.string().max(500).optional(),
});

const RunBody = z.object({
  unitId: z.string().min(1),
  reportImage: ImageInput,
  postImage: ImageInput,
  coords: z.object({ lat: z.number(), lon: z.number() }).optional(),
  time: z.string().optional(),
  rule: RuleInput,
  authorization: AuthorizationInput,
  signature: z.string().optional(),
  operatorNullifier: z.string().optional(),
});

/** Never leak custodied private keys over the API. */
function publicUnit(u: UnitDoc) {
  const { hederaPrivateKey, ...rest } = u;
  return rest;
}

export async function registerEngagementRoutes(app: FastifyInstance, c: Collections) {
  // Hedera / 0G status — handy for the frontend to show what's live.
  app.get('/settlement/status', async () => ({
    hederaEnabled,
    network: config.hedera.network,
    operatorId: config.hedera.operatorId || null,
    defpointTokenId: config.hedera.defpointTokenId || null,
    evidenceTopicId: config.hedera.evidenceTopicId || null,
    model: config.zerog.model,
  }));

  app.post<{ Body: unknown }>('/settlement/onboard', async (req) => {
    const body = OnboardBody.parse(req.body);
    const unit = await onboardUnit(c, body);
    return publicUnit(unit);
  });

  app.get('/settlement/units', async () => {
    const rows = (await c.units.find().sort({ createdAt: -1 }).limit(100).toArray()) as unknown as UnitDoc[];
    return rows.map(publicUnit);
  });

  // The unit bound to the logged-in account (pre-designed demo users carry a
  // `unitId` on their invite row). `unit` is null until the unit is onboarded.
  app.get('/settlement/my-unit', async (req) => {
    const code = req.session?.code;
    const invite = code ? await c.invites.findOne({ _id: code }) : null;
    const unitId = (invite?.unitId as string | undefined) ?? null;
    const unit = unitId ? ((await c.units.findOne({ _id: unitId })) as UnitDoc | null) : null;
    return { unitId, unit: unit ? publicUnit(unit) : null };
  });

  app.post<{ Body: unknown }>('/settlement/engagements', async (req) => {
    const body = RunBody.parse(req.body);
    try {
      return await runEngagement(c, body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'engagement failed';
      if (msg.startsWith('unknown unit')) throw new HttpError(404, 'NO_UNIT', msg);
      throw new HttpError(502, 'ENGAGEMENT_FAILED', msg);
    }
  });

  // Streaming variant: same pipeline, but emits one NDJSON line per real step as
  // it completes (report → agent_a → downing → agent_b → settled → done). Lets the
  // engagement window show genuine per-step progress instead of estimated timers.
  app.post<{ Body: unknown }>('/settlement/engagements/stream', async (req, reply) => {
    const body = RunBody.parse(req.body);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // don't let a proxy buffer the stream
    });
    const write = (obj: unknown) => reply.raw.write(JSON.stringify(obj) + '\n');
    try {
      const doc = await runEngagement(c, { ...body, onStep: (ev) => write(ev) });
      write({ step: 'done', engagement: doc });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'engagement failed';
      write({ step: 'error', message: msg });
    } finally {
      reply.raw.end();
    }
  });

  app.get('/settlement/engagements', async () => {
    return c.engagements.find().sort({ createdAt: -1 }).limit(50).toArray();
  });

  app.get<{ Params: { id: string } }>('/settlement/engagements/:id', async (req) => {
    const doc = await c.engagements.findOne({ _id: req.params.id });
    if (!doc) throw new HttpError(404, 'NO_ENGAGEMENT', `no engagement ${req.params.id}`);
    return doc;
  });

  // --- government policy: the active settlement rule + per-target tariffs ---
  const RuleFull = z.object({
    minThreatConfidence: z.number().min(0).max(1),
    requireDestroyed: z.boolean(),
    minDestroyedConfidence: z.number().min(0).max(1),
    requireConsistent: z.boolean(),
    payout: z.number().int().positive(),
    tariffs: z
      .object({
        shahed_class: z.number().int().positive(),
        other_uav: z.number().int().positive(),
        aircraft: z.number().int().positive(),
      })
      .partial()
      .optional(),
  });

  app.get('/settlement/rule', async () => ({
    rule: await loadActiveRule(c),
    default: DEFAULT_RULE,
  }));

  // Government/admin only (enforced in requireRoleForWrite). Persists the singleton.
  app.put<{ Body: unknown }>('/settlement/rule', async (req) => {
    const rule = RuleFull.parse(req.body) as SettlementRule;
    const who = req.session?.label ?? req.session?.role ?? 'government';
    return { rule: await saveActiveRule(c, rule, who) };
  });

  // Government/admin resolves a disputed (frozen) engagement: release the hold and
  // pay the tariff, or deny the claim (unfreeze the account, pay nothing). Either
  // way the decision is journaled to HCS and the engagement's outcome is updated.
  const ResolveBody = z.object({
    action: z.enum(['release', 'deny']),
    note: z.string().max(300).optional(),
  });
  app.post<{ Params: { id: string }; Body: unknown }>(
    '/settlement/engagements/:id/resolve',
    async (req) => {
      const { action, note } = ResolveBody.parse(req.body);
      const doc = await c.engagements.findOne({ _id: req.params.id });
      if (!doc) throw new HttpError(404, 'NO_ENGAGEMENT', `no engagement ${req.params.id}`);
      if (doc.status !== 'frozen') {
        throw new HttpError(409, 'NOT_FROZEN', 'only frozen (disputed) engagements can be resolved');
      }
      const unitAccountId = (doc.unitAccountId as string | null) ?? null;
      const classification = (((doc.agentA as any)?.verdict?.classification ?? 'unclear') as AgentAVerdict['classification']);
      const who = req.session?.label ?? req.session?.role ?? 'government';

      if (action === 'release') {
        const amount = payoutFor(await loadActiveRule(c), classification);
        let txId: string | undefined;
        if (hederaEnabled && unitAccountId) {
          await unfreezeUnit(unitAccountId);
          const { transferTx } = await payDefpoint(unitAccountId, amount);
          txId = transferTx;
        }
        const journal = await submitEvidence(
          evidence('payout', req.params.id, {
            reason: `dispute released by ${who}`,
            unitAccountId,
            amount,
            transferTx: txId ?? null,
            note: note ?? null,
          }),
        );
        const settlement = {
          outcome: 'paid' as const,
          reason: `dispute released by government${note ? `: ${note}` : ''}`,
          payout: amount,
          txId,
          journal,
        };
        await c.engagements.updateOne(
          { _id: req.params.id },
          { $set: { status: 'paid', settlement, resolvedBy: who, resolvedAt: new Date() } },
        );
        return { ok: true, outcome: 'paid', payout: amount, txId };
      }

      // deny — release the freeze so the account is usable again, but pay nothing.
      let txId: string | undefined;
      if (hederaEnabled && unitAccountId) {
        const { unfreezeTx } = await unfreezeUnit(unitAccountId);
        txId = unfreezeTx;
      }
      const journal = await submitEvidence(
        evidence('reject', req.params.id, {
          reason: `dispute denied by ${who}`,
          unitAccountId,
          note: note ?? null,
        }),
      );
      const settlement = {
        outcome: 'rejected' as const,
        reason: `dispute denied by government${note ? `: ${note}` : ''}`,
        payout: 0,
        txId,
        journal,
      };
      await c.engagements.updateOne(
        { _id: req.params.id },
        { $set: { status: 'rejected', settlement, resolvedBy: who, resolvedAt: new Date() } },
      );
      return { ok: true, outcome: 'rejected', payout: 0, txId };
    },
  );

  // Spotter flow: one image → Agent A threat ID on 0G, journaled to HCS as a
  // `report`. No payout — a spot is raw intel that crews/settlement build on.
  app.post<{ Body: unknown }>('/settlement/spots', async (req) => {
    const body = SpotBody.parse(req.body);
    const spotId = `spot-${crypto.randomBytes(5).toString('hex')}`;
    const spotter = req.session?.label ?? 'unknown';

    let a: Awaited<ReturnType<typeof runAgentA>>;
    try {
      a = await runAgentA(body.image);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'threat identification failed';
      throw new HttpError(502, 'SPOT_FAILED', msg);
    }

    const journal = await submitEvidence(
      evidence('report', spotId, {
        spotter,
        imageHash: a.imageHash,
        verdict: a.verdict,
        requestId: a.requestId,
        model: a.model,
        coords: body.coords ?? null,
        note: body.note ?? null,
      }),
    );

    const doc: SpotDoc = {
      _id: spotId,
      spotterLabel: spotter,
      coords: body.coords ?? null,
      note: body.note ?? null,
      agentA: {
        verdict: a.verdict,
        requestId: a.requestId,
        model: a.model,
        imageHash: a.imageHash,
        latencyMs: a.latencyMs,
        journal,
      },
      createdAt: new Date(),
    };
    await c.spots.insertOne(doc);
    return doc;
  });

  app.get('/settlement/spots', async () => {
    return c.spots.find().sort({ createdAt: -1 }).limit(50).toArray();
  });

  // The public ledger: replay the HCS journal (optionally for one engagement)
  // via the Mirror Node. Feeds the frontend ledger panel.
  app.get<{ Querystring: { engagementId?: string; limit?: string } }>(
    '/settlement/ledger',
    async (req) => {
      if (!config.hedera.evidenceTopicId) return { topicId: null, entries: [] };
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const all = await readJournal({ limit });
      const entries = req.query.engagementId ? forEngagement(all, req.query.engagementId) : all;
      return { topicId: config.hedera.evidenceTopicId, entries };
    },
  );

  // Live DEFPOINT balance for a unit (Mirror Node read).
  app.get<{ Params: { id: string } }>('/settlement/units/:id/balance', async (req) => {
    const unit = (await c.units.findOne({ _id: req.params.id })) as UnitDoc | null;
    if (!unit) throw new HttpError(404, 'NO_UNIT', `no unit ${req.params.id}`);
    if (!unit.hederaAccountId) return { accountId: null, balance: 0 };
    return { accountId: unit.hederaAccountId, balance: await defpointBalance(unit.hederaAccountId) };
  });
}
