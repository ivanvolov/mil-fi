import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The 4 pipeline steps + the settle-agent, in demo-video order. */
export type RunStage = 'idle' | 'report' | 'agent_a' | 'downing' | 'agent_b' | 'settling';

interface SettlementStore {
  /** Persisted. When on, every settlement query serves the seeded dataset —
   *  lets the demo video get shot with no backend/network. Real API is default. */
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  // ephemeral
  selectedEngagementId: string | null;
  selectEngagement: (id: string | null) => void;
  /** Live run progress. The POST returns everything at once (~20-30s of 0G
   *  inference), so stages advance on estimated timings and resolve on response. */
  runStage: RunStage;
  runStartedAt: number | null;
  runError: string | null;
  setRunStage: (s: RunStage) => void;
  startRun: () => void;
  finishRun: (error?: string) => void;
}

export const useSettlementStore = create<SettlementStore>()(
  persist(
    (set) => ({
      demoMode: false,
      setDemoMode: (demoMode) => set({ demoMode }),
      selectedEngagementId: null,
      selectEngagement: (selectedEngagementId) => set({ selectedEngagementId }),
      runStage: 'idle',
      runStartedAt: null,
      runError: null,
      setRunStage: (runStage) => set({ runStage }),
      startRun: () => set({ runStage: 'report', runStartedAt: Date.now(), runError: null }),
      finishRun: (error) =>
        set({ runStage: 'idle', runStartedAt: null, runError: error ?? null }),
    }),
    {
      name: 'mil-fi-settlement',
      partialize: (s) => ({ demoMode: s.demoMode }),
    },
  ),
);
