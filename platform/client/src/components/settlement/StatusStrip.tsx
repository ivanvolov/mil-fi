import { ExternalLink } from 'lucide-react';
import { useSettlementStatus } from '../../queries/useSettlement';
import { useSettlementStore } from '../../stores/settlementStore';
import { hashscanUrl } from '../../lib/hashscan';

function ChainLink({ kind, id, label }: { kind: 'token' | 'topic' | 'account'; id: string; label: string }) {
  return (
    <a
      href={hashscanUrl(kind, id)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 text-muted hover:text-cyan"
      title={`${label} ${id} on HashScan`}
    >
      <span className="uppercase tracking-wider text-[9px]">{label}</span>
      <span className="text-ink">{id}</span>
      <ExternalLink size={9} />
    </a>
  );
}

/** Header strip: what's live on-chain right now + the demo-mode fallback toggle. */
export function StatusStrip() {
  const status = useSettlementStatus().data;
  const demoMode = useSettlementStore((s) => s.demoMode);
  const setDemoMode = useSettlementStore((s) => s.setDemoMode);

  return (
    <div className="flex items-center gap-4 font-mono text-[10px]">
      {status && (
        <>
          <span
            className={`flex items-center gap-1.5 ${status.hederaEnabled ? 'text-green' : 'text-amber'}`}
            title={status.hederaEnabled ? 'Hedera live' : 'Hedera disabled — journal entries skipped'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.hederaEnabled ? 'bg-green animate-pulse' : 'bg-amber'}`} />
            HEDERA {status.network.toUpperCase()}
          </span>
          <span className="text-muted">
            0G <span className="text-ink">{status.model}</span>
          </span>
          {status.defpointTokenId && <ChainLink kind="token" id={status.defpointTokenId} label="DEFPOINT" />}
          {status.evidenceTopicId && <ChainLink kind="topic" id={status.evidenceTopicId} label="Topic" />}
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (demoMode) return setDemoMode(false);
          // Enabling demo mode replaces every settlement view with scripted mock
          // data. Make that an explicit choice, never an accidental click.
          if (window.confirm('Switch to DEMO MODE?\n\nEvery settlement view will show scripted mock data. Nothing will be written to Hedera and no 0G inference will run. A red banner will mark the whole surface as fake.')) {
            setDemoMode(true);
          }
        }}
        title={demoMode ? 'Demo mode ON — scripted data, no Hedera/0G calls' : 'Switch to scripted demo data (no backend needed)'}
        className={`px-2 py-0.5 border uppercase tracking-wider text-[9px] font-bold ${
          demoMode
            ? 'border-red text-white bg-red'
            : 'border-line text-muted hover:border-amber hover:text-amber'
        }`}
      >
        {demoMode ? '● DEMO MODE' : 'LIVE'}
      </button>
    </div>
  );
}
