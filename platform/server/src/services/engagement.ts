import crypto from 'node:crypto';
import type { Collections, UnitDoc } from '../db.js';
import { runAgentA, runAgentB, type ImageInput } from '../verification/agents.js';
import { evidence, submitEvidence } from '../hedera/journal.js';
import { createUnitAccount, associateAndGrantKyc } from '../hedera/token.js';
import { settleEngagement, type SettlementRule } from '../hedera/settle.js';
import { postEngagementVerdict } from '../world/client.js';
import type { PayoutAuthorization } from '../world/auth.js';
import { hederaEnabled } from '../config.js';

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
  /** World proof blob (verified in step 5). For now its mere presence flips
   * humanBacked; pass none to onboard a bot for the negative scenario. */
  worldProof?: unknown;
}

export type { UnitDoc } from '../db.js';

export async function onboardUnit(c: Collections, input: OnboardInput): Promise<UnitDoc> {
  const unitId = input.unitId ?? `unit-${crypto.randomBytes(4).toString('hex')}`;
  const humanBacked = input.worldProof != null;
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
    kyc,
    createdAt: now,
    updatedAt: now,
  };
  await c.units.replaceOne({ _id: unitId }, doc, { upsert: true });
  return doc;
}

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
}

export async function runEngagement(c: Collections, input: RunEngagementInput) {
  const unit = (await c.units.findOne({ _id: input.unitId })) as UnitDoc | null;
  if (!unit) throw new Error(`unknown unit ${input.unitId}`);

  const engagementId = `eng-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();

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
  const aJournal = await submitEvidence(
    evidence('verdict_a', engagementId, {
      imageHash: a.imageHash,
      verdict: a.verdict,
      requestId: a.requestId,
      model: a.model,
    }),
  );

  // Step 3 — downing.
  const downingJournal = await submitEvidence(
    evidence('downing', engagementId, { unitId: unit._id, time: input.time ?? now }),
  );

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

  // Step 5b — Interface 3: report the verdict to World. When both flags are true,
  // the operator's agent may autonomously pull a payout authorization.
  const worldVerdict = await postEngagementVerdict({
    engagementId,
    threatConfirmed: a.verdict.is_threat,
    killConfirmed: b.verdict.destroyed,
    operatorNullifier: input.operatorNullifier,
    evidenceHashes: [a.imageHash, b.imageHash],
  });

  // Step 6 — settle-agent decides + acts (also journals payout/freeze/reject).
  const settlement = await settleEngagement({
    engagementId,
    unitAccountId: unit.hederaAccountId ?? 'n/a',
    humanBacked: unit.humanBacked,
    a: a.verdict,
    b: b.verdict,
    rule: input.rule,
    authorization: input.authorization,
    signature: input.signature,
  });

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
    settlement,
    status: settlement.outcome,
    createdAt: new Date(),
  };
  await c.engagements.insertOne(doc);
  return doc;
}
