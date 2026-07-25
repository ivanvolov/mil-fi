import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSettlementStore, type RunStage } from '../stores/settlementStore';
import {
  DEMO_BALANCES,
  DEMO_ENGAGEMENTS,
  DEMO_LEDGER,
  DEMO_STATUS,
  DEMO_TOPIC_ID,
  DEMO_UNITS,
  demoRunResult,
} from '../lib/settlement-demo';
import type {
  Engagement,
  LedgerResponse,
  OnboardBody,
  RunEngagementBody,
  Unit,
} from '../types/settlement';

/**
 * Settlement Console data hooks. Every query branches on demo mode inside its
 * queryFn (demoMode is part of the queryKey, so flipping the toggle refetches
 * cleanly). Ledger + engagements poll so the HCS trail feels alive on screen.
 */

function useDemoMode() {
  return useSettlementStore((s) => s.demoMode);
}

export function useSettlementStatus() {
  const demo = useDemoMode();
  return useQuery({
    queryKey: ['settlement', 'status', demo],
    queryFn: () => (demo ? Promise.resolve(DEMO_STATUS) : api.getSettlementStatus()),
    staleTime: 60_000,
  });
}

export function useUnits() {
  const demo = useDemoMode();
  return useQuery<Unit[]>({
    queryKey: ['settlement', 'units', demo],
    queryFn: () => (demo ? Promise.resolve(DEMO_UNITS) : api.getUnits()),
    refetchInterval: 15_000,
  });
}

export function useUnitBalance(unitId: string | null, accountId: string | null) {
  const demo = useDemoMode();
  return useQuery({
    queryKey: ['settlement', 'balance', unitId, demo],
    queryFn: () =>
      demo
        ? Promise.resolve(DEMO_BALANCES[unitId!] ?? { accountId: null, balance: 0 })
        : api.getUnitBalance(unitId!),
    // Bots have no wallet — skip the mirror-node read entirely.
    enabled: !!unitId && (demo || !!accountId),
    refetchInterval: 10_000,
  });
}

export function useEngagements() {
  const demo = useDemoMode();
  return useQuery<Engagement[]>({
    queryKey: ['settlement', 'engagements', demo],
    queryFn: () => (demo ? Promise.resolve(DEMO_ENGAGEMENTS) : api.getEngagements()),
    refetchInterval: 5_000,
  });
}

export function useLedger(engagementId?: string) {
  const demo = useDemoMode();
  return useQuery<LedgerResponse>({
    queryKey: ['settlement', 'ledger', engagementId ?? 'all', demo],
    queryFn: () => {
      if (!demo) return api.getLedger({ engagementId, limit: 100 });
      const entries = engagementId
        ? DEMO_LEDGER.filter(
            (e) => 'engagementId' in e.record && e.record.engagementId === engagementId,
          )
        : DEMO_LEDGER;
      return Promise.resolve({ topicId: DEMO_TOPIC_ID, entries });
    },
    refetchInterval: 4_000,
  });
}

export function useOnboardUnit() {
  const demo = useDemoMode();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardBody): Promise<Unit> => {
      if (!demo) return api.onboardUnit(body);
      // Demo mode: fabricate a unit locally so the flow still demos offline.
      const humanBacked = body.worldProof != null;
      const now = new Date().toISOString();
      const unit: Unit = {
        _id: body.unitId || `unit-${Math.random().toString(16).slice(2, 10)}`,
        hederaAccountId: humanBacked ? '0.0.9754177' : null,
        hederaPublicKey: humanBacked ? '302a300506032b6570032100demo' : null,
        humanBackingLevel: body.humanBackingLevel,
        humanBacked,
        worldProof: body.worldProof ?? null,
        kyc: humanBacked
          ? { associateTx: '0.0.9713724@demo.1', kycTx: '0.0.9713724@demo.2' }
          : null,
        createdAt: now,
        updatedAt: now,
      };
      DEMO_UNITS.unshift(unit);
      return Promise.resolve(unit);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement', 'units'] });
    },
  });
}

/** Estimated per-stage durations (ms) for the live progress display. The real
 *  POST is opaque until it returns, so stages advance on these timings and the
 *  final stage holds at "settling" until the response lands. */
const STAGE_PLAN: Array<{ stage: RunStage; afterMs: number }> = [
  { stage: 'report', afterMs: 0 },
  { stage: 'agent_a', afterMs: 1_500 },
  { stage: 'downing', afterMs: 11_000 },
  { stage: 'agent_b', afterMs: 12_500 },
  { stage: 'settling', afterMs: 22_000 },
];

const DEMO_STAGE_PLAN: Array<{ stage: RunStage; afterMs: number }> = [
  { stage: 'report', afterMs: 0 },
  { stage: 'agent_a', afterMs: 900 },
  { stage: 'downing', afterMs: 2_600 },
  { stage: 'agent_b', afterMs: 3_400 },
  { stage: 'settling', afterMs: 5_200 },
];

export function useRunEngagement() {
  const demo = useDemoMode();
  const qc = useQueryClient();
  const { startRun, setRunStage, finishRun, selectEngagement } = useSettlementStore.getState();

  return useMutation({
    mutationFn: async (body: RunEngagementBody): Promise<Engagement> => {
      startRun();
      const plan = demo ? DEMO_STAGE_PLAN : STAGE_PLAN;
      const timers = plan
        .filter((p) => p.afterMs > 0)
        .map((p) => window.setTimeout(() => setRunStage(p.stage), p.afterMs));
      try {
        if (demo) {
          await new Promise((r) => setTimeout(r, 6_200));
          return demoRunResult(body.unitId);
        }
        return await api.runEngagement(body);
      } finally {
        timers.forEach((t) => window.clearTimeout(t));
      }
    },
    onSuccess: (eng) => {
      finishRun();
      selectEngagement(eng._id);
      qc.invalidateQueries({ queryKey: ['settlement', 'engagements'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'balance'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'units'] });
    },
    onError: (err) => {
      finishRun(err instanceof Error ? err.message : 'engagement failed');
    },
  });
}
