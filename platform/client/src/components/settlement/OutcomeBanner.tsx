import { Ban, CircleDollarSign, ExternalLink, Snowflake, UserX } from 'lucide-react';
import type { Engagement } from '../../types/settlement';
import { hashscanUrl } from '../../lib/hashscan';

const STYLES = {
  paid: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'PAID' },
  frozen: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'FROZEN' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'REJECTED' },
} as const;

/** The settle-agent's decision, big and unambiguous. The rejected-bot case is
 *  the demo climax — it gets the explicit "no human backing" treatment. */
export function OutcomeBanner({ engagement }: { engagement: Engagement }) {
  const s = engagement.settlement;
  const st = STYLES[s.outcome];
  const noHuman = s.outcome === 'rejected' && s.reason.includes('no human backing');

  return (
    <div
      className="border font-mono px-4 py-3 flex items-center gap-4"
      style={{ borderColor: st.color, background: st.bg }}
    >
      <div className="shrink-0" style={{ color: st.color }}>
        {s.outcome === 'paid' && <CircleDollarSign size={30} />}
        {s.outcome === 'frozen' && <Snowflake size={30} />}
        {s.outcome === 'rejected' && (noHuman ? <UserX size={30} /> : <Ban size={30} />)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-xl font-bold tracking-[0.15em]" style={{ color: st.color }}>
            {st.label}
          </span>
          {s.outcome === 'paid' && (
            <span className="text-xl font-bold text-green">
              {s.payout} <span className="text-sm">DEFPOINT</span>
            </span>
          )}
          {noHuman && (
            <span className="text-[10px] uppercase tracking-wider text-red border border-red px-1.5 py-0.5">
              no verified human behind this agent — bot gets nothing
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted mt-1">{s.reason}</div>
        <div className="text-[9px] text-muted uppercase tracking-wider mt-1 flex items-center gap-3 flex-wrap">
          <span>
            unit <span className="text-ink">{engagement.unitId}</span>
          </span>
          {s.txId && (
            <a
              href={hashscanUrl('transaction', s.txId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-cyan hover:underline"
              title="Settlement transaction on HashScan"
            >
              tx {s.txId} <ExternalLink size={9} />
            </a>
          )}
          {s.journal.ok && s.journal.sequenceNumber !== undefined && (
            <span>
              journaled · HCS seq <span className="text-cyan">#{s.journal.sequenceNumber}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
