import type { AgentAVerdict, AgentBVerdict } from '../verification/agents.js';
import { evidence, submitEvidence, type EvidenceReceipt } from './journal.js';
import { payDefpoint, freezeUnit } from './token.js';

/**
 * The settle-agent's brain: apply the government-level rule to a completed
 * engagement (Agent A + Agent B verdicts) and act on it — pay the unit, freeze
 * it pending dispute, or reject the claim. Every decision is journaled to HCS.
 *
 * The rule is data, set by government-level operators (docs/05, level 1). The
 * agent doesn't decide policy; it enforces whatever thresholds it's handed —
 * which is exactly why an autonomous agent moving money is defensible here.
 */

export interface SettlementRule {
  /** Agent A must call it a threat with at least this confidence. */
  minThreatConfidence: number;
  /** Agent B must confirm destruction. */
  requireDestroyed: boolean;
  minDestroyedConfidence: number;
  /** Agent B's outcome must be consistent with Agent A's classification. */
  requireConsistent: boolean;
  /** DEFPOINT paid per confirmed downing. */
  payout: number;
}

/** Default government rule: "pay from 95%, both agents must agree." */
export const DEFAULT_RULE: SettlementRule = {
  minThreatConfidence: 0.95,
  requireDestroyed: true,
  minDestroyedConfidence: 0.8,
  requireConsistent: true,
  payout: 100,
};

export type Decision = 'pay' | 'freeze' | 'reject';

export interface DecisionResult {
  decision: Decision;
  reason: string;
  payout: number;
}

/** Pure policy: given both verdicts, decide. No side effects. */
export function decideSettlement(
  a: AgentAVerdict,
  b: AgentBVerdict,
  rule: SettlementRule = DEFAULT_RULE,
): DecisionResult {
  if (!a.is_threat || a.confidence < rule.minThreatConfidence) {
    return { decision: 'reject', reason: `Agent A did not confirm a threat at ≥${rule.minThreatConfidence}`, payout: 0 };
  }
  if (rule.requireDestroyed && !b.destroyed) {
    return { decision: 'freeze', reason: 'Agent B did not confirm destruction', payout: 0 };
  }
  if (b.confidence < rule.minDestroyedConfidence) {
    return { decision: 'freeze', reason: `Agent B confidence below ${rule.minDestroyedConfidence} — needs manual review`, payout: 0 };
  }
  if (rule.requireConsistent && !b.consistent_with_prior) {
    return { decision: 'freeze', reason: 'Agent B outcome inconsistent with Agent A — needs manual review', payout: 0 };
  }
  return { decision: 'pay', reason: 'both agents confirmed; rule satisfied', payout: rule.payout };
}

export interface SettleInput {
  engagementId: string;
  unitAccountId: string;
  /** World human-backing check result (step 5). A bot with no human backing
   * is rejected before any policy check. */
  humanBacked: boolean;
  a: AgentAVerdict;
  b: AgentBVerdict;
  rule?: SettlementRule;
}

export interface SettleOutcome {
  outcome: 'paid' | 'frozen' | 'rejected';
  reason: string;
  payout: number;
  /** On-chain transaction id when money/state moved. */
  txId?: string;
  journal: EvidenceReceipt;
}

/**
 * Run the settle-agent on one engagement: enforce human-backing, apply the rule,
 * move DEFPOINT or freeze, and journal the outcome to HCS. Never throws on a
 * journal failure — the on-chain money move is what matters; journaling degrades.
 */
export async function settleEngagement(input: SettleInput): Promise<SettleOutcome> {
  const { engagementId, unitAccountId, humanBacked, a, b } = input;
  const rule = input.rule ?? DEFAULT_RULE;

  // Negative path: no human behind the agent → refuse before policy.
  if (!humanBacked) {
    const journal = await submitEvidence(
      evidence('reject', engagementId, { reason: 'no-human-backing', unitAccountId }),
    );
    return { outcome: 'rejected', reason: 'claim rejected: no human backing (World)', payout: 0, journal };
  }

  const decision = decideSettlement(a, b, rule);

  if (decision.decision === 'reject') {
    const journal = await submitEvidence(
      evidence('reject', engagementId, { reason: decision.reason, unitAccountId }),
    );
    return { outcome: 'rejected', reason: decision.reason, payout: 0, journal };
  }

  if (decision.decision === 'freeze') {
    const { freezeTx } = await freezeUnit(unitAccountId);
    const journal = await submitEvidence(
      evidence('freeze', engagementId, { reason: decision.reason, unitAccountId, freezeTx }),
    );
    return { outcome: 'frozen', reason: decision.reason, payout: 0, txId: freezeTx, journal };
  }

  // pay
  const { transferTx } = await payDefpoint(unitAccountId, decision.payout);
  const journal = await submitEvidence(
    evidence('payout', engagementId, {
      reason: decision.reason,
      unitAccountId,
      amount: decision.payout,
      transferTx,
    }),
  );
  return { outcome: 'paid', reason: decision.reason, payout: decision.payout, txId: transferTx, journal };
}
