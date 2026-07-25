/**
 * Client-local types for the Settlement Console. Mirrors the shapes served by
 * the settlement routes (platform/server/src/routes/engagements.ts) — kept
 * client-side on purpose so this surface never touches platform/shared.
 */

export type EvidenceKind =
  | 'report'
  | 'verdict_a'
  | 'downing'
  | 'verdict_b'
  | 'payout'
  | 'freeze'
  | 'reject';

/** HCS submit receipt. `ok:false` + skippedReason when Hedera is off/failed. */
export type Journal = {
  ok: boolean;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  skippedReason?: string;
};

export type ThreatClassification =
  | 'shahed_class'
  | 'other_uav'
  | 'aircraft'
  | 'not_a_threat'
  | 'unclear';

export type AgentAVerdict = {
  is_threat: boolean;
  classification: ThreatClassification;
  objects_seen: string[];
  confidence: number;
  reasoning: string;
};

export type EvidenceType = 'wreckage' | 'thermal_detonation' | 'empty_sky' | 'inconclusive';

export type AgentBVerdict = {
  destroyed: boolean;
  evidence_type: EvidenceType;
  consistent_with_prior: boolean;
  objects_seen: string[];
  confidence: number;
  reasoning: string;
};

export type SettlementRule = {
  minThreatConfidence: number;
  requireDestroyed: boolean;
  minDestroyedConfidence: number;
  requireConsistent: boolean;
  payout: number;
};

export type SettlementOutcome = 'paid' | 'frozen' | 'rejected';

export type HumanBackingLevel = 'government' | 'spotter' | 'military';

/** Public unit doc (server strips the custodied private key). */
export type Unit = {
  _id: string;
  hederaAccountId: string | null;
  hederaPublicKey: string | null;
  humanBackingLevel: HumanBackingLevel;
  humanBacked: boolean;
  worldProof: unknown;
  kyc: { associateTx: string; kycTx: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunRecord<V> = {
  verdict: V;
  requestId?: string;
  model: string;
  imageHash: string;
  latencyMs: number;
  journal: Journal;
};

export type Engagement = {
  _id: string;
  unitId: string;
  unitAccountId: string | null;
  coords: { lat: number; lon: number } | null;
  time: string;
  report: { imageHash: string; journal: Journal };
  agentA: AgentRunRecord<AgentAVerdict>;
  downing: { journal: Journal };
  agentB: AgentRunRecord<AgentBVerdict>;
  settlement: {
    outcome: SettlementOutcome;
    reason: string;
    payout: number;
    txId?: string;
    journal: Journal;
  };
  status: SettlementOutcome;
  createdAt: string;
};

export type EvidenceRecord = {
  v: number;
  kind: EvidenceKind;
  engagementId: string;
  ts: string;
  data: Record<string, unknown>;
};

export type LedgerEntry = {
  sequenceNumber: number;
  consensusTimestamp: string;
  record: EvidenceRecord | { raw: string };
};

export type LedgerResponse = { topicId: string | null; entries: LedgerEntry[] };

export type SettlementStatus = {
  hederaEnabled: boolean;
  network: string;
  operatorId: string | null;
  defpointTokenId: string | null;
  evidenceTopicId: string | null;
  model: string;
};

export type ImagePayload = { dataUrl: string } | { base64: string; mime?: string } | { url: string };

export type OnboardBody = {
  unitId?: string;
  humanBackingLevel: HumanBackingLevel;
  worldProof?: unknown;
};

export type RunEngagementBody = {
  unitId: string;
  reportImage: ImagePayload;
  postImage: ImagePayload;
  coords?: { lat: number; lon: number };
  time?: string;
  rule?: SettlementRule;
};

export type UnitBalance = { accountId: string | null; balance: number };

/** True when a ledger entry's record parsed as a structured evidence record. */
export function isEvidenceRecord(r: LedgerEntry['record']): r is EvidenceRecord {
  return 'kind' in r;
}
