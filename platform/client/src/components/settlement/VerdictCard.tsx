import { BadgeCheck, Cpu, XCircle } from 'lucide-react';
import type { AgentAVerdict, AgentBVerdict, AgentRunRecord, Journal } from '../../types/settlement';

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.9 ? '#22c55e' : value >= 0.7 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-line">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

function JournalLine({ journal }: { journal: Journal }) {
  if (!journal.ok) {
    return (
      <div className="text-[9px] text-amber uppercase tracking-wider">
        journal skipped{journal.skippedReason ? ` · ${journal.skippedReason}` : ''}
      </div>
    );
  }
  return (
    <div className="text-[9px] text-muted uppercase tracking-wider">
      HCS seq <span className="text-cyan">#{journal.sequenceNumber}</span>
      {journal.consensusTimestamp && <> · consensus {journal.consensusTimestamp}</>}
    </div>
  );
}

function Verdict({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="flex items-center gap-1.5 text-green text-sm font-bold uppercase tracking-wider">
      <BadgeCheck size={16} /> {yes}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-red text-sm font-bold uppercase tracking-wider">
      <XCircle size={16} /> {no}
    </span>
  );
}

function CardShell({
  title,
  accent,
  run,
  children,
}: {
  title: string;
  accent: string;
  run: AgentRunRecord<unknown>;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line bg-panel font-mono flex-1 min-w-0">
      <div
        className="px-3 py-2 border-b border-line flex items-center justify-between gap-2"
        style={{ borderLeft: `2px solid ${accent}` }}
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>
          {title}
        </span>
        <span
          className="flex items-center gap-1 text-[9px] text-muted uppercase tracking-wider truncate"
          title={`0G verifiable inference · ${run.model}${run.requestId ? ` · request ${run.requestId}` : ''}`}
        >
          <Cpu size={10} className="text-cyan shrink-0" />
          <span className="truncate">{run.model}</span>
          <span className="text-cyan shrink-0">{run.latencyMs}ms</span>
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ObjectChips({ objects }: { objects: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {objects.map((o) => (
        <span key={o} className="text-[9px] border border-line text-muted px-1 py-0.5 uppercase tracking-wide">
          {o}
        </span>
      ))}
    </div>
  );
}

export function AgentACard({ run }: { run: AgentRunRecord<AgentAVerdict> }) {
  const v = run.verdict;
  return (
    <CardShell title="Agent A · Threat ID" accent="#a78bfa" run={run}>
      <div className="flex items-center justify-between gap-2">
        <Verdict ok={v.is_threat} yes="THREAT" no="NO THREAT" />
        <span className="text-[10px] uppercase tracking-wider border border-line px-1.5 py-0.5 text-ink">
          {v.classification.replace(/_/g, ' ')}
        </span>
      </div>
      <ConfidenceBar value={v.confidence} />
      <ObjectChips objects={v.objects_seen} />
      <p className="text-[10px] text-muted leading-relaxed">{v.reasoning}</p>
      <div className="text-[9px] text-muted truncate" title={run.imageHash}>
        img {run.imageHash}
      </div>
      <JournalLine journal={run.journal} />
    </CardShell>
  );
}

export function AgentBCard({ run }: { run: AgentRunRecord<AgentBVerdict> }) {
  const v = run.verdict;
  return (
    <CardShell title="Agent B · Battle Damage" accent="#60a5fa" run={run}>
      <div className="flex items-center justify-between gap-2">
        <Verdict ok={v.destroyed} yes="DESTROYED" no="NOT DESTROYED" />
        <span className="text-[10px] uppercase tracking-wider border border-line px-1.5 py-0.5 text-ink">
          {v.evidence_type.replace(/_/g, ' ')}
        </span>
      </div>
      <ConfidenceBar value={v.confidence} />
      <div
        className={`text-[9px] uppercase tracking-wider ${v.consistent_with_prior ? 'text-green' : 'text-amber'}`}
      >
        {v.consistent_with_prior ? '✓ consistent with Agent A' : '⚠ inconsistent with Agent A'}
      </div>
      <ObjectChips objects={v.objects_seen} />
      <p className="text-[10px] text-muted leading-relaxed">{v.reasoning}</p>
      <div className="text-[9px] text-muted truncate" title={run.imageHash}>
        img {run.imageHash}
      </div>
      <JournalLine journal={run.journal} />
    </CardShell>
  );
}
