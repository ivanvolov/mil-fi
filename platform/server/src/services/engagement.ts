import crypto from 'node:crypto';
import type { Collections, UnitDoc } from '../db.js';
import { runAgentA, runAgentB, type ImageInput } from '../verification/agents.js';
import { evidence, submitEvidence } from '../hedera/journal.js';
import { createUnitAccount, associateAndGrantKyc } from '../hedera/token.js';
import { settleEngagement, type SettlementRule } from '../hedera/settle.js';
import { loadActiveRule } from './settlementRule.js';
import { postEngagementVerdict, getPayoutAuthorization } from '../world/client.js';
import type { PayoutAuthorization } from '../world/auth.js';
import { hederaEnabled, worldClientEnabled } from '../config.js';

/**
 * The engagement pipeline — the demo spine wired together:
 *
 *   onboardUnit  → create a Hedera account for a unit, KYC-grant it (or mark it
 *                  a bot with no human backing for the negative demo).
 *
 *   runEngagement → report → Agent A → downing → Agent B, journaling every step
 *                  to HCS, then hand both verdicts to the settle-agent which
 *                  pays / freezes / rejects. Persists the whole trail to Mongo.
 */

export type HumanBackingLevel = 'government' | 'spotter' | 'military';

export interface OnboardInput {
  unitId?: string;
  humanBackingLevel: HumanBackingLevel;
  /** World proof blob (demo). Its presence flips humanBacked; omit to onboard a
   * bot for the negative scenario. */
  worldProof?: unknown;
  /** Real World identity: nullifier + tier. When present, the run flow pulls a
   * signed payout authorization from World for this unit's engagements. */
  worldNullifier?: string;
  worldTier?: number;
}

export type { UnitDoc } from '../db.js';

export async function onboardUnit(c: Collections, input: OnboardInput): Promise<UnitDoc> {
  const unitId = input.unitId ?? `unit-${crypto.randomBytes(4).toString('hex')}`;
  const humanBacked = input.worldProof != null || input.worldNullifier != null;
  const now = new Date();

  let hederaAccountId: string | null = null;
  let hederaPrivateKey: string | null = null;
  let hederaPublicKey: string | null = null;
  let kyc: UnitDoc['kyc'] = null;

  // A human-backed unit gets a real, KYC'd Hedera account so it can be paid. A
  // bot (no proof) gets none — the settle-agent will reject its claims anyway.
  if (hederaEnabled && humanBacked) {
    const acct = await createUnitAccount();
    hederaAccountId = acct.accountId;
    hederaPrivateKey = acct.privateKey;
    hederaPublicKey = acct.publicKey;
    kyc = await associateAndGrantKyc(acct.accountId, acct.privateKey);
  }

  const doc: UnitDoc = {
    _id: unitId,
    hederaAccountId,
    hederaPrivateKey,
    hederaPublicKey,
    humanBackingLevel: input.humanBackingLevel,
    humanBacked,
    worldProof: input.worldProof ?? null,
    worldNullifier: input.worldNullifier ?? null,
    worldTier: input.worldTier ?? null,
    kyc,
    createdAt: now,
    updatedAt: now,
  };
  await c.units.replaceOne({ _id: unitId }, doc, { upsert: true });
  return doc;
}

/**
 * A single real pipeline step, emitted the moment its underlying await resolves.
 * The streaming route forwards these verbatim so the UI lights up on genuine
 * completion — no estimated timers. Each carries the same data the final doc does.
 */
export type EngagementStepEvent =
  | { step: 'report'; engagementId: string; imageHash: string; coords: { lat: number; lon: number } | null; time: string; journal: unknown }
  | { step: 'agent_a'; agentA: { verdict: unknown; requestId?: string; model: string; imageHash: string; latencyMs: number; journal: unknown } }
  | { step: 'downing'; downing: { journal: unknown } }
  | { step: 'agent_b'; agentB: { verdict: unknown; requestId?: string; model: string; imageHash: string; latencyMs: number; journal: unknown } }
  | { step: 'settled'; settlement: unknown };

export interface RunEngagementInput {
  unitId: string;
  reportImage: ImageInput;
  postImage: ImageInput;
  coords?: { lat: number; lon: number };
  time?: string;
  rule?: SettlementRule;
  /** Interface 1: signed payout authorization from World (required to pay when
   * World auth is configured). */
  authorization?: PayoutAuthorization;
  signature?: string;
  /** Operator's World nullifier, reported to World in the verdict (Interface 3). */
  operatorNullifier?: string;
  /** Optional progress sink. Called after each real step completes so a streaming
   * caller can surface genuine per-step timing instead of estimated animations. */
  onStep?: (ev: EngagementStepEvent) => void;
}

export async function runEngagement(c: Collections, input: RunEngagementInput) {
  const unit = (await c.units.findOne({ _id: input.unitId })) as UnitDoc | null;
  if (!unit) throw new Error(`unknown unit ${input.unitId}`);

  const engagementId = `eng-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();
  const emit = (ev: EngagementStepEvent) => {
    try { input.onStep?.(ev); } catch { /* a dead stream must never break settlement */ }
  };

  // Step 1 — report. Agent A resolves the hash; journal the report with it.
  const a = await runAgentA(input.reportImage);
  const reportJournal = await submitEvidence(
    evidence('report', engagementId, {
      unitId: unit._id,
      imageHash: a.imageHash,
      coords: input.coords ?? null,
      time: input.time ?? now,
    }),
  );
  emit({ step: 'report', engagementId, imageHash: a.imageHash, coords: input.coords ?? null, time: input.time ?? now, journal: reportJournal });
  const aJournal = await submitEvidence(
    evidence('verdict_a', engagementId, {
      imageHash: a.imageHash,
      verdict: a.verdict,
      requestId: a.requestId,
      model: a.model,
    }),
  );
  emit({ step: 'agent_a', agentA: { verdict: a.verdict, requestId: a.requestId, model: a.model, imageHash: a.imageHash, latencyMs: a.latencyMs, journal: aJournal } });

  // Step 3 — downing.
  const downingJournal = await submitEvidence(
    evidence('downing', engagementId, { unitId: unit._id, time: input.time ?? now }),
  );
  emit({ step: 'downing', downing: { journal: downingJournal } });

  // Step 4 — Agent B, told what A saw.
  const b = await runAgentB(input.postImage, a.verdict);
  const bJournal = await submitEvidence(
    evidence('verdict_b', engagementId, {
      imageHash: b.imageHash,
      verdict: b.verdict,
      requestId: b.requestId,
      model: b.model,
    }),
  );
  emit({ step: 'agent_b', agentB: { verdict: b.verdict, requestId: b.requestId, model: b.model, imageHash: b.imageHash, latencyMs: b.latencyMs, journal: bJournal } });

  // Step 5b — Interface 3: report the verdict to World. When both flags are true,
  // the operator's agent may autonomously pull a payout authorization.
  const worldVerdict = await postEngagementVerdict({
    engagementId,
    threatConfirmed: a.verdict.is_threat,
    killConfirmed: b.verdict.destroyed,
    operatorNullifier: input.operatorNullifier,
    evidenceHashes: [a.imageHash, b.imageHash],
  });

  // Step 5c — Interface 1: pull a signed payout authorization from World for
  // this unit's operator. A bot (no nullifier) or under-verified operator gets
  // none → the settle-agent rejects the payout. An explicit authorization on the
  // request wins (e.g. operator pulled it themselves).
  let authorization = input.authorization;
  let signature = input.signature;
  let claimAgent: { address: string; humanId: string; backing: 'agentbook' | 'dev-stub' } | undefined;
  if (!authorization && worldClientEnabled && unit.worldNullifier) {
    const pulled = await getPayoutAuthorization({
      engagementId,
      nullifier: unit.worldNullifier,
      tier: unit.worldTier ?? 0,
      amount: String(input.rule?.payout ?? 100),
    });
    if (pulled) {
      authorization = pulled.authorization;
      signature = pulled.signature;
      claimAgent = pulled.agent;
    }
  }

  // Step 6 — settle-agent decides + acts (also journals payout/freeze/reject).
  // An explicit per-request rule wins; otherwise the persisted government policy
  // (tariffs + thresholds set in the Government window) governs the payout.
  const rule = input.rule ?? (await loadActiveRule(c));
  const settlement = await settleEngagement({
    engagementId,
    unitAccountId: unit.hederaAccountId ?? 'n/a',
    humanBacked: unit.humanBacked,
    a: a.verdict,
    b: b.verdict,
    rule,
    authorization,
    signature,
    agent: claimAgent,
  });
  emit({ step: 'settled', settlement });

  const doc = {
    _id: engagementId,
    unitId: unit._id,
    unitAccountId: unit.hederaAccountId,
    coords: input.coords ?? null,
    time: input.time ?? now,
    report: { imageHash: a.imageHash, journal: reportJournal },
    agentA: { verdict: a.verdict, requestId: a.requestId, model: a.model, imageHash: a.imageHash, latencyMs: a.latencyMs, journal: aJournal },
    downing: { journal: downingJournal },
    agentB: { verdict: b.verdict, requestId: b.requestId, model: b.model, imageHash: b.imageHash, latencyMs: b.latencyMs, journal: bJournal },
    worldVerdict,
    claimAgent: claimAgent ?? null,
    settlement,
    status: settlement.outcome,
    createdAt: new Date(),
  };
  await c.engagements.insertOne(doc);
  return doc;
}
