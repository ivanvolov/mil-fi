import { AlertTriangle } from 'lucide-react';
import { useSettlementStore } from '../../stores/settlementStore';

/**
 * Loud, unmissable banner shown whenever demo mode is on. Demo mode serves the
 * seeded dataset from lib/settlement-demo.ts — nothing is on Hedera, no 0G call
 * is made. Without this banner, scripted mock data is indistinguishable from a
 * real on-chain run, which is exactly the trap we want to close. Render it at the
 * top of every settlement-family surface (Engagement, Government, Settlement).
 */
export function DemoModeBanner() {
  const demoMode = useSettlementStore((s) => s.demoMode);
  const setDemoMode = useSettlementStore((s) => s.setDemoMode);
  if (!demoMode) return null;
  return (
    <div className="shrink-0 bg-red text-white font-mono flex items-center gap-3 px-4 py-1.5 border-b border-red">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="text-[11px] uppercase tracking-wider font-bold">Demo mode</span>
      <span className="text-[11px] opacity-90">
        scripted mock data — nothing here is on Hedera or 0G, no chain writes, no inference
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setDemoMode(false)}
        className="text-[10px] uppercase tracking-wider border border-white/70 px-2 py-0.5 hover:bg-white/15"
      >
        switch to live
      </button>
    </div>
  );
}
