import { History } from 'lucide-react';
import { useEngagements } from '../../queries/useSettlement';
import { useSettlementStore } from '../../stores/settlementStore';
import type { SettlementOutcome } from '../../types/settlement';

const OUTCOME_COLOR: Record<SettlementOutcome, string> = {
  paid: '#22c55e',
  frozen: '#f59e0b',
  rejected: '#ef4444',
};

/** Recent engagements — click to review any past trail (paid next to rejected
 *  is the side-by-side story beat). Pass `unitId` to scope the list to one unit
 *  (military sees only its own claims). */
export function EngagementList({ unitId }: { unitId?: string | null }) {
  const all = useEngagements().data ?? [];
  const engagements = unitId ? all.filter((e) => e.unitId === unitId) : all;
  const selectedId = useSettlementStore((s) => s.selectedEngagementId);
  const select = useSettlementStore((s) => s.selectEngagement);

  return (
    <div className="border border-line bg-panel font-mono">
      <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
        <History size={11} className="text-cyan" /> Engagements
      </div>
      <div className="max-h-56 overflow-y-auto">
        {engagements.length === 0 && (
          <div className="p-3 text-[10px] text-muted">none yet — run one from the panel on the left</div>
        )}
        {engagements.map((e) => {
          const color = OUTCOME_COLOR[e.status];
          const active = e._id === selectedId;
          return (
            <button
              key={e._id}
              type="button"
              onClick={() => select(e._id)}
              className={`w-full text-left px-3 py-1.5 border-b border-line/60 flex items-center gap-2 hover:bg-line/40 ${
                active ? 'bg-cyan/5' : ''
              }`}
              style={{ borderLeft: `2px solid ${active ? '#06b6d4' : 'transparent'}` }}
            >
              <span
                className="text-[8px] font-semibold uppercase tracking-wider px-1 py-px border w-14 text-center shrink-0"
                style={{ color, borderColor: `${color}66` }}
              >
                {e.status}
              </span>
              <span className="text-[10px] text-ink truncate">{e._id}</span>
              <span className="text-[9px] text-muted truncate">{e.unitId}</span>
              <span className="flex-1" />
              {e.status === 'paid' && (
                <span className="text-[10px] text-green font-semibold tabular-nums shrink-0">
                  +{e.settlement.payout}
                </span>
              )}
              <span className="text-[9px] text-muted tabular-nums shrink-0">
                {new Date(e.createdAt).toISOString().slice(11, 19)}Z
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
