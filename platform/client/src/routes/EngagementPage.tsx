import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Crosshair, Loader2, Play, Upload } from 'lucide-react';
import { api } from '../api/client';
import { AppRail } from '../components/AppRail';
import { StatusStrip } from '../components/settlement/StatusStrip';
import { AgentACard, AgentBCard } from '../components/settlement/VerdictCard';
import { OutcomeBanner } from '../components/settlement/OutcomeBanner';
import { LedgerPanel } from '../components/settlement/LedgerPanel';
import { useMe } from '../queries/useMe';
import { useMyUnit, useOnboardUnit, useUnits } from '../queries/useSettlement';
import { useSettlementStore } from '../stores/settlementStore';
import { useNow } from '../hooks/useNow';
import { shrinkImagePair } from '../lib/settlement-image';
import type {
  AgentAVerdict,
  AgentBVerdict,
  AgentRunRecord,
  Engagement,
  Journal,
} from '../types/settlement';
import preStrikeUrl from '../assets/settlement/drone2.jpg';
import postStrikeUrl from '../assets/settlement/drone.jpg';

/** Demo scene coords (Burshtyn) — same area as the map app's sample scenario. */
const DEMO_COORDS = { lat: 49.216, lon: 24.663 };

const inputCls =
  'bg-bg border border-line px-2 py-1 text-[11px] text-ink font-mono focus:border-cyan outline-none';

type StepKey = 'report' | 'agent_a' | 'downing' | 'agent_b' | 'settled';
const STEP_ORDER: StepKey[] = ['report', 'agent_a', 'downing', 'agent_b', 'settled'];
const STEP_META: Record<StepKey, { label: string; sub: string }> = {
  report: { label: 'Report', sub: 'image hash → HCS' },
  agent_a: { label: 'Agent A', sub: '0G threat inference' },
  downing: { label: 'Downing', sub: 'engagement → HCS' },
  agent_b: { label: 'Agent B', sub: '0G damage inference' },
  settled: { label: 'Settle-agent', sub: 'pay / freeze / reject' },
};

/** Real, streamed progress — populated from the NDJSON stream, never from timers. */
interface RunState {
  active: boolean;
  startedAt: number;
  landedAt: Partial<Record<StepKey, number>>;
  reportJournal?: Journal;
  agentA?: AgentRunRecord<AgentAVerdict>;
  downingJournal?: Journal;
  agentB?: AgentRunRecord<AgentBVerdict>;
  result?: Engagement;
  error?: string;
}

type ImageSlot = { dataUrl: string | null; previewUrl: string; name: string };

function ImagePicker({ label, slot, onPick }: { label: string; slot: ImageSlot; onPick: (s: ImageSlot) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted mb-1">{label}</div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-full h-24 border border-line hover:border-cyan overflow-hidden group"
        title={`${slot.name} — click to upload a different photo`}
      >
        <img src={slot.previewUrl} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-bg/70 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-cyan">
          <Upload size={10} /> replace
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-bg/80 px-1 py-0.5 text-[8px] text-muted truncate text-left">
          {slot.name}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onPick({ dataUrl: r.result as string, previewUrl: r.result as string, name: f.name });
          r.readAsDataURL(f);
        }}
      />
    </div>
  );
}

/** One row in the live pipeline. Shows real state: pending / running / done, with
 *  the true elapsed at completion and the real journal sequence for the step. */
function StepRow({
  stepKey,
  status,
  elapsedS,
  journal,
  children,
}: {
  stepKey: StepKey;
  status: 'pending' | 'running' | 'done';
  elapsedS?: number;
  journal?: Journal;
  children?: React.ReactNode;
}) {
  const meta = STEP_META[stepKey];
  const color = status === 'done' ? 'text-green' : status === 'running' ? 'text-cyan' : 'text-muted';
  const bar = status === 'done' ? 'bg-green' : status === 'running' ? 'bg-cyan animate-pulse' : 'bg-line';
  return (
    <div className="border border-line bg-panel font-mono">
      <div className={`h-1 ${bar}`} />
      <div className="px-3 py-2 flex items-center gap-2">
        <span className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold ${color}`}>
          {status === 'done' && <Check size={12} />}
          {status === 'running' && <Loader2 size={12} className="animate-spin" />}
          {status === 'pending' && <span className="w-3 h-3 inline-block rounded-full border border-line" />}
          {meta.label}
        </span>
        <span className="text-[9px] text-muted uppercase tracking-wider">{meta.sub}</span>
        <div className="flex-1" />
        {elapsedS !== undefined && (
          <span className="text-[10px] text-muted tabular-nums" title="time from run start">
            +{elapsedS.toFixed(1)}s
          </span>
        )}
        {journal && (
          <span className="text-[9px] uppercase tracking-wider">
            {journal.ok ? (
              <span className="text-muted">HCS <span className="text-cyan">#{journal.sequenceNumber}</span></span>
            ) : (
              <span className="text-amber" title={journal.skippedReason}>journal skipped</span>
            )}
          </span>
        )}
      </div>
      {children && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * Engagement window — the military crew's own workspace. Pick the two photos,
 * fire the engagement, and watch the real pipeline advance step by step off the
 * live NDJSON stream (report → Agent A on 0G → downing → Agent B on 0G →
 * settle-agent paying / freezing / rejecting DEFPOINT on Hedera). No estimated
 * timers: every row lights up when its real on-chain / inference step completes.
 */
export function EngagementPage() {
  const qc = useQueryClient();
  const role = useMe().data?.role;
  const canRun = role === 'admin' || role === 'military';
  const selectEngagement = useSettlementStore((s) => s.selectEngagement);

  const units = useUnits().data ?? [];
  const myUnitId = useMyUnit().data?.unitId ?? null;
  const boundUnitId = role === 'military' ? myUnitId : null;
  const onboard = useOnboardUnit();
  const [pickedUnitId, setPickedUnitId] = useState('');

  const selectedUnit = useMemo(
    () =>
      boundUnitId
        ? units.find((u) => u._id === boundUnitId) ?? null
        : units.find((u) => u._id === pickedUnitId) ?? units[0] ?? null,
    [units, pickedUnitId, boundUnitId],
  );

  const [reportImg, setReportImg] = useState<ImageSlot>({
    dataUrl: null,
    previewUrl: preStrikeUrl,
    name: 'drone2.jpg · sample threat',
  });
  const [postImg, setPostImg] = useState<ImageSlot>({
    dataUrl: null,
    previewUrl: postStrikeUrl,
    name: 'drone.jpg · sample wreckage',
  });

  const [run, setRun] = useState<RunState | null>(null);
  const now = useNow(200);
  const running = run?.active ?? false;

  const start = async () => {
    if (!selectedUnit || running) return;
    const startedAt = Date.now();
    setRun({ active: true, startedAt, landedAt: {} });
    const stamp = () => Date.now();
    try {
      const [reportDataUrl, postDataUrl] = await shrinkImagePair(
        reportImg.dataUrl ?? preStrikeUrl,
        postImg.dataUrl ?? postStrikeUrl,
      );
      const result = await api.runEngagementStream(
        {
          unitId: selectedUnit._id,
          reportImage: { dataUrl: reportDataUrl },
          postImage: { dataUrl: postDataUrl },
          coords: DEMO_COORDS,
        },
        (ev) => {
          setRun((prev) => {
            if (!prev) return prev;
            const next: RunState = { ...prev, landedAt: { ...prev.landedAt } };
            switch (ev.step) {
              case 'report':
                next.landedAt.report = stamp();
                next.reportJournal = ev.journal;
                break;
              case 'agent_a':
                next.landedAt.agent_a = stamp();
                next.agentA = ev.agentA;
                break;
              case 'downing':
                next.landedAt.downing = stamp();
                next.downingJournal = ev.downing.journal;
                break;
              case 'agent_b':
                next.landedAt.agent_b = stamp();
                next.agentB = ev.agentB;
                break;
              case 'settled':
                next.landedAt.settled = stamp();
                break;
              case 'done':
                next.result = ev.engagement;
                break;
            }
            return next;
          });
        },
      );
      setRun((prev) => (prev ? { ...prev, active: false, result } : prev));
      selectEngagement(result._id);
      // Refresh the oversight surfaces now that money / journal actually moved.
      qc.invalidateQueries({ queryKey: ['settlement', 'engagements'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'balance'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'units'] });
    } catch (err) {
      setRun((prev) => (prev ? { ...prev, active: false, error: err instanceof Error ? err.message : 'engagement failed' } : prev));
    }
  };

  // Status of a given step: done if it has landed, running if it's the next
  // expected while the run is active, otherwise pending.
  const stepStatus = (k: StepKey): 'pending' | 'running' | 'done' => {
    if (run?.landedAt[k]) return 'done';
    if (!running) return 'pending';
    const firstPending = STEP_ORDER.find((s) => !run?.landedAt[s]);
    return firstPending === k ? 'running' : 'pending';
  };
  const elapsedAt = (k: StepKey): number | undefined => {
    const t = run?.landedAt[k];
    return t && run ? (t - run.startedAt) / 1000 : undefined;
  };
  const liveElapsed = run ? ((run.active ? now : run.landedAt.settled ?? now) - run.startedAt) / 1000 : 0;

  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em] flex items-center gap-2">
          <Crosshair size={16} className="text-green" /> ENGAGEMENT
        </div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
          file downing → agents verify on 0G → settle-agent pays on Hedera
        </div>
        <div className="flex-1" />
        <StatusStrip />
      </header>

      <div className="flex-1 flex min-h-0">
        <AppRail />

        <aside className="w-[320px] shrink-0 border-r border-line p-3 flex flex-col gap-3 overflow-y-auto">
          <div className="border border-line bg-panel font-mono">
            <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold">
              File an engagement
            </div>
            <div className="p-3 flex flex-col gap-3">
              {boundUnitId ? (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted mb-1">your unit</div>
                  {selectedUnit ? (
                    <div className="border border-line/60 bg-bg/40 px-2 py-1.5 text-[11px] font-mono">
                      {selectedUnit._id}{' '}
                      <span className={selectedUnit.humanBacked ? 'text-green' : 'text-red'}>
                        {selectedUnit.humanBacked ? `· human (${selectedUnit.humanBackingLevel})` : '· BOT — no human'}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={onboard.isPending}
                      onClick={() =>
                        onboard.mutate({
                          unitId: boundUnitId,
                          humanBackingLevel: 'military',
                          worldProof: { source: 'world-id', verified_at: new Date().toISOString() },
                        })
                      }
                      className="w-full border border-cyan text-cyan text-[10px] uppercase tracking-wider py-1.5 hover:bg-cyan/10 disabled:opacity-50"
                    >
                      {onboard.isPending ? `activating ${boundUnitId}…` : `activate ${boundUnitId} (Hedera account + KYC)`}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted mb-1">claiming unit</div>
                  <select
                    className={inputCls + ' w-full'}
                    value={selectedUnit?._id ?? ''}
                    onChange={(e) => setPickedUnitId(e.target.value)}
                  >
                    {units.length === 0 && <option value="">no units onboarded</option>}
                    {units.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u._id} {u.humanBacked ? `· human (${u.humanBackingLevel})` : '· BOT — no human'}
                      </option>
                    ))}
                  </select>
                  {selectedUnit && !selectedUnit.humanBacked && (
                    <div className="text-[9px] text-red mt-1">⚠ no World proof — the settle-agent will reject this claim</div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <ImagePicker label="pre-strike report" slot={reportImg} onPick={setReportImg} />
                <ImagePicker label="post-strike evidence" slot={postImg} onPick={setPostImg} />
              </div>

              <button
                type="button"
                disabled={!canRun || !selectedUnit || running}
                onClick={() => void start()}
                title={canRun ? 'report → Agent A → downing → Agent B → settle (~20-30s live)' : 'military or admin role required'}
                className="flex items-center justify-center gap-2 border border-green text-green text-[11px] font-semibold uppercase tracking-[0.2em] py-2 hover:bg-green/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={12} />
                {running ? 'engagement running…' : 'run engagement'}
              </button>
              {!canRun && (
                <div className="text-[9px] text-muted">viewing as {role ?? '…'} — running requires military or admin</div>
              )}
              {run?.error && <div className="text-[9px] text-red">{run.error}</div>}
            </div>
          </div>

          <p className="text-[9px] text-muted font-mono leading-relaxed px-1">
            Every step is real: two live 0G inference calls and Hedera HCS/HTS writes. The pipeline on
            the right advances only as each actual step returns — no simulated timings.
          </p>
        </aside>

        <main className="flex-1 min-w-0 p-3 flex flex-col gap-3 overflow-y-auto">
          {!run && (
            <div className="border border-line bg-panel font-mono p-6 text-center text-[11px] text-muted">
              no engagement running — file one from the left to watch the live pipeline
            </div>
          )}

          {run && (
            <>
              <div className="flex items-center justify-between font-mono">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {run.active ? 'live pipeline' : run.error ? 'pipeline halted' : 'pipeline complete'}
                </span>
                <span className="text-[11px] text-muted tabular-nums">{liveElapsed.toFixed(1)}s total</span>
              </div>

              {run.result && !run.active && <OutcomeBanner engagement={run.result} />}

              <StepRow stepKey="report" status={stepStatus('report')} elapsedS={elapsedAt('report')} journal={run.reportJournal} />

              <StepRow stepKey="agent_a" status={stepStatus('agent_a')} elapsedS={elapsedAt('agent_a')}>
                {run.agentA && (
                  <div className="flex">
                    <AgentACard run={run.agentA} />
                  </div>
                )}
              </StepRow>

              <StepRow stepKey="downing" status={stepStatus('downing')} elapsedS={elapsedAt('downing')} journal={run.downingJournal} />

              <StepRow stepKey="agent_b" status={stepStatus('agent_b')} elapsedS={elapsedAt('agent_b')}>
                {run.agentB && (
                  <div className="flex">
                    <AgentBCard run={run.agentB} />
                  </div>
                )}
              </StepRow>

              <StepRow
                stepKey="settled"
                status={stepStatus('settled')}
                elapsedS={elapsedAt('settled')}
                journal={run.result?.settlement.journal}
              />
            </>
          )}
        </main>

        <aside className="w-[360px] shrink-0 min-h-0">
          <LedgerPanel />
        </aside>
      </div>
    </div>
  );
}
