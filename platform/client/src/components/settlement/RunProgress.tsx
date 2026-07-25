import { Check, Loader2 } from 'lucide-react';
import { useSettlementStore, type RunStage } from '../../stores/settlementStore';
import { useNow } from '../../hooks/useNow';

const STEPS: Array<{ stage: RunStage; label: string; sub: string }> = [
  { stage: 'report', label: 'Report', sub: 'hash + journal to HCS' },
  { stage: 'agent_a', label: 'Agent A', sub: '0G threat inference' },
  { stage: 'downing', label: 'Downing', sub: 'engagement journaled' },
  { stage: 'agent_b', label: 'Agent B', sub: '0G damage inference' },
  { stage: 'settling', label: 'Settle-agent', sub: 'pay / freeze / reject' },
];

const ORDER: RunStage[] = ['report', 'agent_a', 'downing', 'agent_b', 'settling'];

/** Live pipeline tracker while an engagement runs (~20-30s of real 0G inference).
 *  Stages advance on estimated timings; the run resolves when the POST returns. */
export function RunProgress() {
  const stage = useSettlementStore((s) => s.runStage);
  const startedAt = useSettlementStore((s) => s.runStartedAt);
  const now = useNow(250);
  if (stage === 'idle') return null;

  const activeIdx = ORDER.indexOf(stage);
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;

  return (
    <div className="border border-cyan/40 bg-panel font-mono px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-cyan font-semibold flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> engagement running — live 0G inference + Hedera writes
        </span>
        <span className="text-[11px] text-muted tabular-nums">{elapsed.toFixed(1)}s</span>
      </div>
      <div className="flex items-stretch gap-2">
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={step.stage} className="flex-1 min-w-0">
              <div
                className={`h-1 mb-1.5 ${done ? 'bg-green' : active ? 'bg-cyan animate-pulse' : 'bg-line'}`}
              />
              <div
                className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${
                  done ? 'text-green' : active ? 'text-cyan' : 'text-muted'
                }`}
              >
                {done && <Check size={10} />}
                {active && <Loader2 size={10} className="animate-spin" />}
                {step.label}
              </div>
              <div className="text-[9px] text-muted truncate">{step.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
