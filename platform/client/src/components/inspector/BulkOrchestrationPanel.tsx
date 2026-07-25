import { useMemo } from 'react';
import { Activity, ArrowLeft, Crosshair } from 'lucide-react';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { Threat } from '@shared/schemas/threat';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { useUiStore } from '../../stores/uiStore';
import {
  allocate,
  MFG_MIN_DWELL_SEC,
  formatUsd,
  type Assignment,
  type Role,
} from '@algos/orchestration/orchestration';
import { AssignmentCard, type AssignmentMetric } from './AssignmentCard';
import { useOrchestrationSummary } from '../../queries/useOrchestrationSummary';
import { OrchestrationThinking } from './RightInspector';

const C = {
  red: '#ef4444', cyan: '#06b6d4', amber: '#f59e0b', purple: '#a78bfa', muted: '#8b949e',
};

function categoryColor(cat: string | undefined): string {
  if (cat === 'mfg') return C.amber;
  if (cat === 'manpads') return C.purple;
  return C.cyan;
}

function categoryLabel(cat: string | undefined): string {
  if (cat === 'mfg') return 'MFG';
  if (cat === 'manpads') return 'MANPADS';
  if (cat === 'interceptor') return 'INTERCEPTOR';
  return '?';
}

function roleColor(role: Role): string {
  if (role === 'PRI') return C.cyan;
  return C.amber;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AssignmentRow({
  a, onClick, selected,
}: { a: Assignment; onClick: () => void; selected: boolean }) {
  const metrics: AssignmentMetric[] = [];
  if (a.ttiSec != null) metrics.push({ label: 'TTI', value: formatSec(a.ttiSec) });
  if (a.role === 'MFG' && a.dwellSec != null) {
    metrics.push({ label: 'dwell', value: `${a.dwellSec.toFixed(1)}s` });
  } else {
    metrics.push({ label: 'dist', value: `${a.distKm.toFixed(1)} km` });
  }
  if (a.role !== 'MFG' && a.costUsd != null) {
    metrics.push({ label: 'cost', value: formatUsd(a.costUsd) });
  }
  return (
    <AssignmentCard
      code={a.launcher.code}
      categoryLabel={categoryLabel(a.type.category)}
      categoryColor={categoryColor(a.type.category)}
      typeName={a.type.displayName}
      leftBadge={{ label: a.role, color: roleColor(a.role) }}
      selected={selected}
      onClick={onClick}
      metrics={metrics}
    />
  );
}

function ThreatBlock({
  threat, assignments, onPickThreat, onPickLauncher, selection,
}: {
  threat: Threat;
  assignments: Assignment[];
  onPickThreat: () => void;
  onPickLauncher: (id: string) => void;
  selection: { kind: string; id: string } | null;
}) {
  return (
    <div className="px-4 py-3 border-b border-line">
      <div
        className="flex items-baseline justify-between gap-2 mb-2 cursor-pointer"
        onClick={onPickThreat}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-sm font-bold" style={{ color: C.red }}>{threat.code}</span>
          <span className="text-[10px] font-mono text-muted truncate">
            {threat.altitudeM}m · {threat.speedKmh}km/h
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted shrink-0">
          {assignments.length} assigned
        </span>
      </div>
      {assignments.length === 0 ? (
        <div className="text-[11px] text-muted font-mono">— no launcher in range —</div>
      ) : (
        <div className="space-y-1">
          {assignments.map((a) => (
            <AssignmentRow
              key={a.launcher._id + a.role}
              a={a}
              selected={selection?.kind === 'interceptor' && selection.id === a.launcher._id}
              onClick={() => onPickLauncher(a.launcher._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BulkOrchestrationPanel({ data }: { data: LayerFull }) {
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setBulkOrchestrate = useUiStore((s) => s.setBulkOrchestrate);

  const intercepted = useMemo(
    () => [...data.threats].sort((a, b) => a.code.localeCompare(b.code)),
    [data.threats],
  );

  const typesById = useMemo(() => {
    const m = new Map<string, InterceptorType>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const assignmentsByThreat = useMemo(
    () => allocate(intercepted, data.interceptors, typesById),
    [intercepted, data.interceptors, typesById],
  );

  const total = intercepted.reduce(
    (acc, t) => acc + (assignmentsByThreat.get(t._id)?.length ?? 0),
    0,
  );

  // Coverage rule: a threat is critical when it lacks kinetic redundancy (<2 non-MFG
  // interceptors) OR the MFG terminal-defense layer (0 MFG). MFG isn't a substitute for
  // a second interceptor — both must be present.
  const criticalThreats = useMemo(() => {
    const out: Array<{ code: string; reason: string }> = [];
    for (const t of intercepted) {
      const list = assignmentsByThreat.get(t._id) ?? [];
      const nonMfg = list.filter((a) => a.role !== 'MFG').length;
      const mfg = list.length - nonMfg;
      const reasons: string[] = [];
      if (nonMfg === 0) reasons.push('no interceptors');
      else if (nonMfg < 2) reasons.push('no backup');
      if (mfg < 1) reasons.push('no MFG');
      if (reasons.length > 0) out.push({ code: t.code, reason: reasons.join(' + ') });
    }
    return out;
  }, [intercepted, assignmentsByThreat]);

  const summaryInput = useMemo(
    () => ({
      threatCount: intercepted.length,
      assignmentCount: total,
      critical: criticalThreats,
    }),
    [intercepted.length, total, criticalThreats],
  );
  const summaryQuery = useOrchestrationSummary(summaryInput, criticalThreats.length > 0);
  const fallbackSummary = criticalThreats.length === 0
    ? null
    : `⚠ ${criticalThreats.length} critical · ${criticalThreats.map((c) => `${c.code} (${c.reason})`).join(', ')}`;

  // Hold the panel until the AI summary is ready — the user sees the same "thinking" beat
  // straight through to a fully-composed panel, rather than a partial render with a
  // "generating summary" placeholder line.
  if (criticalThreats.length > 0 && summaryQuery.isLoading) {
    return <OrchestrationThinking />;
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-line">
        <div className="px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5" style={{ color: C.cyan }}>
              <Crosshair size={11} />
              <span className="text-[10px] uppercase tracking-[0.08em] font-mono">Orchestrate · all threats</span>
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-ink">
              {intercepted.length} threat{intercepted.length === 1 ? '' : 's'}
            </div>
            <div className="text-[10px] text-muted mt-1 font-mono">
              {total} assignment{total === 1 ? '' : 's'} · greedy 2-pass per threat · MFG ≥{MFG_MIN_DWELL_SEC}s dwell
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBulkOrchestrate(false)}
            className="flex items-center gap-1.5 text-muted hover:text-ink border border-line hover:border-ink font-mono text-[10px] uppercase tracking-wider px-2 py-1 shrink-0"
          >
            <ArrowLeft size={11} /> Exit
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-muted">
            <Activity size={10} />
            <span className="text-[10px] uppercase tracking-[0.08em] font-mono">Summary</span>
          </div>
          {criticalThreats.length === 0 ? (
            <div className="text-[10px] text-muted mt-1 font-mono">
              all threats covered · ≥2 kinetic + MFG
            </div>
          ) : (
            <div
              className="text-[10px] mt-1 px-2 py-1 font-mono border w-full"
              style={{ color: C.red, borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }}
            >
              {summaryQuery.data?.summary ?? fallbackSummary}
            </div>
          )}
        </div>
      </div>

      {intercepted.length === 0 ? (
        <div className="p-6 text-center text-muted font-mono text-xs">no intercept threats</div>
      ) : (
        intercepted.map((threat) => (
          <ThreatBlock
            key={threat._id}
            threat={threat}
            assignments={assignmentsByThreat.get(threat._id) ?? []}
            selection={selection}
            onPickThreat={() => setSelection({ kind: 'threat', id: threat._id }, { zoom: true })}
            onPickLauncher={(id) => setSelection({ kind: 'interceptor', id }, { zoom: true })}
          />
        ))
      )}
    </div>
  );
}
