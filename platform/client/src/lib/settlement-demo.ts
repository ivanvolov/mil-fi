/**
 * Demo-mode seed for the Settlement Console: one realistic PAID engagement by a
 * human-backed unit, one REJECTED engagement by a bot (no World proof), and the
 * matching HCS ledger. Lets the whole surface render — and the video get shot —
 * with no backend or network. Real API calls are the default; this is the fallback.
 */
import type {
  Engagement,
  EvidenceKind,
  LedgerEntry,
  SettlementStatus,
  Unit,
  UnitBalance,
} from '../types/settlement';

// Live on-chain constants (testnet) so demo mode still points at the real artifacts.
export const DEMO_TOKEN_ID = '0.0.9753000';
export const DEMO_TOPIC_ID = '0.0.9753001';
export const DEMO_TREASURY_ID = '0.0.9713724';

export const DEMO_STATUS: SettlementStatus = {
  hederaEnabled: true,
  network: 'testnet',
  operatorId: DEMO_TREASURY_ID,
  defpointTokenId: DEMO_TOKEN_ID,
  evidenceTopicId: DEMO_TOPIC_ID,
  model: 'qwen2.5-omni',
};

const T0 = '2026-07-25T14:02:11.000Z';

export const DEMO_UNITS: Unit[] = [
  {
    _id: 'unit-alpha',
    hederaAccountId: '0.0.9754102',
    hederaPublicKey: '302a300506032b657003210077f1…',
    humanBackingLevel: 'spotter',
    humanBacked: true,
    worldProof: { source: 'world-id', verified: true },
    kyc: { associateTx: '0.0.9713724@1784988001.000000001', kycTx: '0.0.9713724@1784988002.000000002' },
    createdAt: '2026-07-25T13:40:01.000Z',
    updatedAt: '2026-07-25T13:40:05.000Z',
  },
  {
    _id: 'unit-bot-7',
    hederaAccountId: null,
    hederaPublicKey: null,
    humanBackingLevel: 'spotter',
    humanBacked: false,
    worldProof: null,
    kyc: null,
    createdAt: '2026-07-25T13:41:30.000Z',
    updatedAt: '2026-07-25T13:41:30.000Z',
  },
];

export const DEMO_BALANCES: Record<string, UnitBalance> = {
  'unit-alpha': { accountId: '0.0.9754102', balance: 100 },
  'unit-bot-7': { accountId: null, balance: 0 },
};

const HASH_PRE = 'sha256:8c1f42ab9be07d3f5a2c6e91d40b7f8e33aa510c96de2b74f1c05a8e6d93b271';
const HASH_POST = 'sha256:2e7d90cc41ab6f0e8d35b12a7c4ef9603b8d215fa0c47e6912db38c50e74a1f6';

function j(seq: number, ts: string) {
  return { ok: true, topicId: DEMO_TOPIC_ID, sequenceNumber: seq, consensusTimestamp: ts };
}

export const DEMO_ENGAGEMENT_PAID: Engagement = {
  _id: 'eng-a41f09c2d7',
  unitId: 'unit-alpha',
  unitAccountId: '0.0.9754102',
  coords: { lat: 49.216, lon: 24.663 },
  time: T0,
  report: { imageHash: HASH_PRE, journal: j(31, '1784988132.041228003') },
  agentA: {
    verdict: {
      is_threat: true,
      classification: 'shahed_class',
      objects_seen: ['delta-wing UAV', 'pusher propeller', 'clear sky'],
      confidence: 0.97,
      reasoning:
        'Delta-wing airframe with rear pusher propeller and dark nose section matches Shahed-136 geometry; no navigation lights or transponder features visible.',
    },
    requestId: '0x9f3a71ce42bd',
    model: 'qwen2.5-omni',
    imageHash: HASH_PRE,
    latencyMs: 8412,
    journal: j(32, '1784988141.502993110'),
  },
  downing: { journal: j(33, '1784988144.118207554') },
  agentB: {
    verdict: {
      destroyed: true,
      evidence_type: 'wreckage',
      consistent_with_prior: true,
      objects_seen: ['charred delta-wing debris', 'scorched ground', 'fragmented airframe'],
      confidence: 0.9,
      reasoning:
        'Wreckage shows a burnt delta-wing planform consistent with the reported Shahed-class UAV; destruction is unambiguous.',
    },
    requestId: '0x4be2d90ca77f',
    model: 'qwen2.5-omni',
    imageHash: HASH_POST,
    latencyMs: 9107,
    journal: j(34, '1784988155.860114092'),
  },
  settlement: {
    outcome: 'paid',
    reason: 'both agents confirmed; rule satisfied',
    payout: 100,
    txId: '0.0.9713724@1784988156.291877443',
    journal: j(35, '1784988158.410332871'),
  },
  status: 'paid',
  createdAt: T0,
};

export const DEMO_ENGAGEMENT_REJECTED: Engagement = {
  _id: 'eng-b7c3e58a10',
  unitId: 'unit-bot-7',
  unitAccountId: null,
  coords: { lat: 49.244, lon: 24.71 },
  time: '2026-07-25T14:09:47.000Z',
  report: { imageHash: HASH_PRE, journal: j(36, '1784988590.180226731') },
  agentA: {
    verdict: {
      is_threat: true,
      classification: 'shahed_class',
      objects_seen: ['delta-wing UAV', 'pusher propeller'],
      confidence: 0.96,
      reasoning: 'Airframe geometry matches Shahed-136 loitering munition.',
    },
    requestId: '0xa11c0de5507d',
    model: 'qwen2.5-omni',
    imageHash: HASH_PRE,
    latencyMs: 7938,
    journal: j(37, '1784988599.322901441'),
  },
  downing: { journal: j(38, '1784988601.077238190') },
  agentB: {
    verdict: {
      destroyed: true,
      evidence_type: 'wreckage',
      consistent_with_prior: true,
      objects_seen: ['charred debris field'],
      confidence: 0.88,
      reasoning: 'Debris consistent with a downed delta-wing UAV.',
    },
    requestId: '0x77e0fb3d219c',
    model: 'qwen2.5-omni',
    imageHash: HASH_POST,
    latencyMs: 8654,
    journal: j(39, '1784988611.719334002'),
  },
  settlement: {
    outcome: 'rejected',
    reason: 'claim rejected: no human backing (World)',
    payout: 0,
    journal: j(40, '1784988613.150887219'),
  },
  status: 'rejected',
  createdAt: '2026-07-25T14:09:47.000Z',
};

export const DEMO_ENGAGEMENTS: Engagement[] = [DEMO_ENGAGEMENT_REJECTED, DEMO_ENGAGEMENT_PAID];

function entry(
  seq: number,
  ts: string,
  kind: EvidenceKind,
  engagementId: string,
  isoTs: string,
  data: Record<string, unknown>,
): LedgerEntry {
  return {
    sequenceNumber: seq,
    consensusTimestamp: ts,
    record: { v: 1, kind, engagementId, ts: isoTs, data },
  };
}

const PAID_ID = DEMO_ENGAGEMENT_PAID._id;
const REJ_ID = DEMO_ENGAGEMENT_REJECTED._id;

export const DEMO_LEDGER: LedgerEntry[] = [
  entry(31, '1784988132.041228003', 'report', PAID_ID, T0, {
    unitId: 'unit-alpha',
    imageHash: HASH_PRE,
    coords: { lat: 49.216, lon: 24.663 },
  }),
  entry(32, '1784988141.502993110', 'verdict_a', PAID_ID, T0, {
    imageHash: HASH_PRE,
    verdict: DEMO_ENGAGEMENT_PAID.agentA.verdict,
    model: 'qwen2.5-omni',
  }),
  entry(33, '1784988144.118207554', 'downing', PAID_ID, T0, { unitId: 'unit-alpha' }),
  entry(34, '1784988155.860114092', 'verdict_b', PAID_ID, T0, {
    imageHash: HASH_POST,
    verdict: DEMO_ENGAGEMENT_PAID.agentB.verdict,
    model: 'qwen2.5-omni',
  }),
  entry(35, '1784988158.410332871', 'payout', PAID_ID, T0, {
    reason: 'both agents confirmed; rule satisfied',
    unitAccountId: '0.0.9754102',
    amount: 100,
    transferTx: DEMO_ENGAGEMENT_PAID.settlement.txId,
  }),
  entry(36, '1784988590.180226731', 'report', REJ_ID, '2026-07-25T14:09:47.000Z', {
    unitId: 'unit-bot-7',
    imageHash: HASH_PRE,
    coords: { lat: 49.244, lon: 24.71 },
  }),
  entry(37, '1784988599.322901441', 'verdict_a', REJ_ID, '2026-07-25T14:09:56.000Z', {
    imageHash: HASH_PRE,
    verdict: DEMO_ENGAGEMENT_REJECTED.agentA.verdict,
    model: 'qwen2.5-omni',
  }),
  entry(38, '1784988601.077238190', 'downing', REJ_ID, '2026-07-25T14:10:01.000Z', {
    unitId: 'unit-bot-7',
  }),
  entry(39, '1784988611.719334002', 'verdict_b', REJ_ID, '2026-07-25T14:10:11.000Z', {
    imageHash: HASH_POST,
    verdict: DEMO_ENGAGEMENT_REJECTED.agentB.verdict,
    model: 'qwen2.5-omni',
  }),
  entry(40, '1784988613.150887219', 'reject', REJ_ID, '2026-07-25T14:10:13.000Z', {
    reason: 'no-human-backing',
    unitAccountId: 'n/a',
  }),
];

/** Demo run: which seeded engagement a simulated run should land on. */
export function demoRunResult(unitId: string): Engagement {
  const unit = DEMO_UNITS.find((u) => u._id === unitId);
  return unit && !unit.humanBacked ? DEMO_ENGAGEMENT_REJECTED : DEMO_ENGAGEMENT_PAID;
}
