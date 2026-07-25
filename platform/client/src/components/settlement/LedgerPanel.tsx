import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useLedger } from '../../queries/useSettlement';
import { useSettlementStore } from '../../stores/settlementStore';
import { hashscanUrl } from '../../lib/hashscan';
import { isEvidenceRecord, type EvidenceKind, type LedgerEntry } from '../../types/settlement';

const KIND_STYLE: Record<EvidenceKind, { color: string; label: string }> = {
  report: { color: '#06b6d4', label: 'REPORT' },
  verdict_a: { color: '#a78bfa', label: 'VERDICT A' },
  downing: { color: '#fb923c', label: 'DOWNING' },
  verdict_b: { color: '#60a5fa', label: 'VERDICT B' },
  payout: { color: '#22c55e', label: 'PAYOUT' },
  freeze: { color: '#f59e0b', label: 'FREEZE' },
  reject: { color: '#ef4444', label: 'REJECT' },
};

/** Consensus timestamps are epoch-seconds.nanos — render as UTC wall clock. */
function consensusToClock(ts: string): string {
  const sec = Number(ts.split('.')[0]);
  if (!Number.isFinite(sec)) return ts;
  return new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function summarize(e: LedgerEntry): string {
  if (!isEvidenceRecord(e.record)) return e.record.raw.slice(0, 80);
  const d = e.record.data as Record<string, any>;
  switch (e.record.kind) {
    case 'report':
      return `${d.unitId ?? '?'} · ${String(d.imageHash ?? '').slice(0, 26)}…`;
    case 'verdict_a': {
      const v = d.verdict ?? {};
      return `${v.is_threat ? 'THREAT' : 'no threat'} · ${v.classification ?? '?'} · ${Math.round((v.confidence ?? 0) * 100)}%`;
    }
    case 'downing':
      return `${d.unitId ?? '?'} engaged target`;
    case 'verdict_b': {
      const v = d.verdict ?? {};
      return `${v.destroyed ? 'DESTROYED' : 'not destroyed'} · ${v.evidence_type ?? '?'} · ${Math.round((v.confidence ?? 0) * 100)}%`;
    }
    case 'payout':
      return `${d.amount ?? '?'} DEFPOINT → ${d.unitAccountId ?? '?'}`;
    case 'freeze':
      return String(d.reason ?? 'frozen pending review');
    case 'reject':
      return String(d.reason ?? 'rejected');
  }
}

/** The immutable, publicly-auditable HCS trail — polls so it feels alive. */
export function LedgerPanel() {
  const selectedId = useSettlementStore((s) => s.selectedEngagementId);
  const ledgerQ = useLedger();
  const topicId = ledgerQ.data?.topicId;
  const entries = [...(ledgerQ.data?.entries ?? [])].sort(
    (a, b) => b.sequenceNumber - a.sequenceNumber,
  );

  return (
    <div className="flex flex-col h-full font-mono border-l border-line bg-panel min-h-0">
      <div className="px-3 py-2.5 border-b border-line flex items-center justify-between gap-2 shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
          Evidence ledger · HCS
        </span>
        {topicId && (
          <a
            href={hashscanUrl('topic', topicId)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[9px] text-cyan hover:underline uppercase tracking-wider"
            title="Audit the full topic on HashScan"
          >
            topic {topicId} <ExternalLink size={9} />
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {entries.length === 0 && (
          <div className="p-4 text-[10px] text-muted">
            {ledgerQ.isLoading ? 'reading mirror node…' : 'no journal entries yet — run an engagement'}
          </div>
        )}
        {entries.map((e) => {
          const rec = isEvidenceRecord(e.record) ? e.record : null;
          const style = rec ? KIND_STYLE[rec.kind] : { color: '#8b949e', label: 'RAW' };
          const highlight = rec && selectedId && rec.engagementId === selectedId;
          return (
            <div
              key={e.sequenceNumber}
              className={`px-3 py-2 border-b border-line/60 ${highlight ? 'bg-cyan/5' : ''}`}
              style={{ borderLeft: `2px solid ${style.color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1 py-px border"
                  style={{ color: style.color, borderColor: `${style.color}66` }}
                >
                  {style.label}
                </span>
                <span className="text-[9px] text-muted tabular-nums">seq #{e.sequenceNumber}</span>
              </div>
              <div className="text-[10px] text-ink mt-1 truncate" title={summarize(e)}>
                {summarize(e)}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {rec && <span className="text-[9px] text-muted truncate">{rec.engagementId}</span>}
                <span className="text-[9px] text-muted tabular-nums shrink-0" title={`consensus ${e.consensusTimestamp}`}>
                  {consensusToClock(e.consensusTimestamp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-line text-[9px] text-muted flex items-start gap-1.5 shrink-0">
        <ShieldCheck size={11} className="text-green shrink-0 mt-px" />
        <span>
          Only SHA-256 image <span className="text-ink">hashes</span> go on-chain — photos never leave
          the platform. Consensus-timestamped, immutable, publicly auditable.
        </span>
      </div>
    </div>
  );
}
