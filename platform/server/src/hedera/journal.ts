import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config, hederaEnabled } from '../config.js';
import { hederaClient } from './client.js';

/**
 * The evidence journal: an append-only log of everything that happens to one
 * engagement, written to the HCS topic minted by `npm run hedera:setup`.
 *
 * HCS gives each message a network-assigned *consensus timestamp* and a
 * monotonic sequence number, so the order and timing can't be rewritten after
 * the fact — that's the whole point. We never put raw imagery here, only its
 * hash plus the verdict, so the topic stays public-auditable on HashScan
 * without leaking a single pixel (see docs/05, the privacy note).
 */

export type EvidenceKind =
  | 'report' // spotter filed a threat: image hash + coords + time
  | 'verdict_a' // Agent A: is it a threat?
  | 'downing' // crew engaged the target
  | 'verdict_b' // Agent B: was it destroyed?
  | 'payout' // settle-agent transferred DEFPOINT
  | 'freeze' // account frozen pending dispute
  | 'reject'; // claim refused (e.g. bot with no human backing)

/** One journal entry. Discriminated by `kind`; `data` carries kind-specific
 * fields (kept loose on purpose — the on-chain record is the source of truth,
 * not a rigid schema). `ts` is the client clock for convenience; the authoritative
 * time is the consensus timestamp returned by the network. */
export interface EvidenceRecord {
  v: 1;
  kind: EvidenceKind;
  engagementId: string;
  ts: string; // ISO-8601, client-side
  data: Record<string, unknown>;
}

export interface EvidenceReceipt {
  ok: boolean;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  /** Set when Hedera is disabled or the submit failed — pipeline keeps running. */
  skippedReason?: string;
}

/** Build a record with the envelope filled in. `ts` passed in so callers can be
 * deterministic in tests; defaults to now. */
export function evidence(
  kind: EvidenceKind,
  engagementId: string,
  data: Record<string, unknown>,
  ts: string = new Date().toISOString(),
): EvidenceRecord {
  return { v: 1, kind, engagementId, ts, data };
}

/**
 * Append one evidence record to the HCS topic. Never throws — if Hedera isn't
 * configured or the submit fails, returns `{ ok: false, skippedReason }` so the
 * verification pipeline is never blocked by the journal being down.
 */
export async function submitEvidence(record: EvidenceRecord): Promise<EvidenceReceipt> {
  if (!hederaEnabled) return { ok: false, skippedReason: 'hedera-disabled' };
  const topicId = config.hedera.evidenceTopicId;
  if (!topicId) return { ok: false, skippedReason: 'no-evidence-topic' };

  try {
    const client = hederaClient();
    const resp = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(record))
      .execute(client);
    const receipt = await resp.getReceipt(client);
    // The submit receipt carries the new sequence number; the consensus
    // timestamp is on the transaction record.
    const txRecord = await resp.getRecord(client);
    return {
      ok: true,
      topicId,
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      consensusTimestamp: txRecord.consensusTimestamp?.toDate().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      topicId,
      skippedReason: err instanceof Error ? err.message : 'submit-failed',
    };
  }
}

/**
 * Read the whole journal back via the Mirror Node — the free REST read API for
 * Hedera state (no SDK/keys needed). Used by the settle-agent to replay an
 * engagement and by the ledger panel to display the trail. Returns entries in
 * consensus order with their sequence numbers and timestamps.
 */
export interface JournalEntry {
  sequenceNumber: number;
  consensusTimestamp: string;
  record: EvidenceRecord | { raw: string };
}

function mirrorBase(): string {
  return config.hedera.network === 'mainnet'
    ? 'https://mainnet.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com';
}

export async function readJournal(opts: { limit?: number } = {}): Promise<JournalEntry[]> {
  const topicId = config.hedera.evidenceTopicId;
  if (!topicId) return [];
  const limit = opts.limit ?? 100;
  const url = `${mirrorBase()}/api/v1/topics/${topicId}/messages?limit=${limit}&order=asc`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`mirror node ${res.status} for topic ${topicId}`);
  const body = (await res.json()) as {
    messages?: Array<{ sequence_number: number; consensus_timestamp: string; message: string }>;
  };

  return (body.messages ?? []).map((m) => {
    // Mirror returns the message base64-encoded.
    const text = Buffer.from(m.message, 'base64').toString('utf8');
    let record: JournalEntry['record'];
    try {
      record = JSON.parse(text) as EvidenceRecord;
    } catch {
      record = { raw: text };
    }
    return {
      sequenceNumber: m.sequence_number,
      consensusTimestamp: m.consensus_timestamp,
      record,
    };
  });
}

/** Filter a replayed journal down to one engagement's entries. */
export function forEngagement(entries: JournalEntry[], engagementId: string): JournalEntry[] {
  return entries.filter(
    (e) => 'engagementId' in e.record && e.record.engagementId === engagementId,
  );
}
