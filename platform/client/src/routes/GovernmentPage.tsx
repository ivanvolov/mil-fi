import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Landmark, Save, Snowflake } from 'lucide-react';
import { api } from '../api/client';
import { AppRail } from '../components/AppRail';
import { DemoModeBanner } from '../components/settlement/DemoModeBanner';
import { StatusStrip } from '../components/settlement/StatusStrip';
import { LedgerPanel } from '../components/settlement/LedgerPanel';
import { UnitBalancesPanel } from '../components/settlement/UnitBalancesPanel';
import { EngagementList } from '../components/settlement/EngagementList';
import { useEngagements } from '../queries/useSettlement';
import { useMe } from '../queries/useMe';
import type { Engagement, SettlementRule } from '../types/settlement';

const inputCls =
  'bg-bg border border-line px-2 py-1 text-[11px] text-ink font-mono focus:border-cyan outline-none';

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Government's own window: set the payout policy (thresholds + per-target-type
 *  tariffs) that the autonomous settle-agent enforces, and adjudicate disputed
 *  (frozen) engagements — release the tariff or deny the claim. Both write to the
 *  live Hedera HCS trail; the rule persists server-side and governs every run. */
export function GovernmentPage() {
  const qc = useQueryClient();
  const role = useMe().data?.role;
  const canGovern = role === 'admin' || role === 'government';

  const ruleQ = useQuery({ queryKey: ['settlement', 'rule'], queryFn: () => api.getRule() });
  const [draft, setDraft] = useState<SettlementRule | null>(null);

  // Seed the editor from the persisted rule once it loads (and whenever a save
  // returns fresh server state), without clobbering in-progress edits.
  useEffect(() => {
    if (ruleQ.data && draft === null) setDraft(ruleQ.data.rule);
  }, [ruleQ.data, draft]);

  const save = useMutation({
    mutationFn: (rule: SettlementRule) => api.putRule(rule),
    onSuccess: (res) => {
      setDraft(res.rule);
      qc.invalidateQueries({ queryKey: ['settlement', 'rule'] });
    },
  });

  const engagements = useEngagements().data ?? [];
  const disputes = engagements.filter((e) => e.status === 'frozen');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const resolve = useMutation({
    mutationFn: (v: { id: string; action: 'release' | 'deny' }) =>
      api.resolveEngagement(v.id, { action: v.action }),
    onMutate: (v) => setResolvingId(v.id),
    onSettled: () => setResolvingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement', 'engagements'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'balance'] });
      qc.invalidateQueries({ queryKey: ['settlement', 'units'] });
    },
  });

  const setTariff = (key: keyof NonNullable<SettlementRule['tariffs']>, v: number) =>
    setDraft((d) => (d ? { ...d, tariffs: { ...d.tariffs, [key]: Math.max(1, Math.round(v)) } } : d));

  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <DemoModeBanner />
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em] flex items-center gap-2">
          <Landmark size={16} className="text-cyan" /> GOVERN
        </div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
          payout policy · tariffs · disputes · unit balances
        </div>
        <div className="flex-1" />
        <StatusStrip />
      </header>

      <div className="flex-1 flex min-h-0">
        <AppRail />

        <aside className="w-[340px] shrink-0 border-r border-line p-3 flex flex-col gap-3 overflow-y-auto">
          <div className="border border-line bg-panel font-mono">
            <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between">
              Payout policy
              {ruleQ.data && draft && JSON.stringify(draft) !== JSON.stringify(ruleQ.data.rule) && (
                <span className="text-amber text-[9px]">· unsaved</span>
              )}
            </div>
            {!draft ? (
              <div className="p-3 text-[10px] text-muted">loading policy…</div>
            ) : (
              <div className="p-3 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5 text-muted uppercase tracking-wider text-[8px]">
                    min threat conf
                    <input
                      className={inputCls}
                      type="number" min={0} max={1} step={0.01} disabled={!canGovern}
                      value={draft.minThreatConfidence}
                      onChange={(e) => setDraft({ ...draft, minThreatConfidence: num(e.target.value, draft.minThreatConfidence) })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-muted uppercase tracking-wider text-[8px]">
                    min destroy conf
                    <input
                      className={inputCls}
                      type="number" min={0} max={1} step={0.01} disabled={!canGovern}
                      value={draft.minDestroyedConfidence}
                      onChange={(e) => setDraft({ ...draft, minDestroyedConfidence: num(e.target.value, draft.minDestroyedConfidence) })}
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-[9px] uppercase tracking-wider text-muted">
                    <input
                      type="checkbox" className="accent-cyan" disabled={!canGovern}
                      checked={draft.requireDestroyed}
                      onChange={(e) => setDraft({ ...draft, requireDestroyed: e.target.checked })}
                    />
                    require destroyed
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-[9px] uppercase tracking-wider text-muted">
                    <input
                      type="checkbox" className="accent-cyan" disabled={!canGovern}
                      checked={draft.requireConsistent}
                      onChange={(e) => setDraft({ ...draft, requireConsistent: e.target.checked })}
                    />
                    require consistent
                  </label>
                </div>

                <div>
                  <div className="text-[8px] uppercase tracking-wider text-muted mb-1">tariff per target (DEFPOINT)</div>
                  <div className="flex flex-col gap-1.5">
                    {([
                      ['shahed_class', 'Shahed'],
                      ['other_uav', 'Other UAV'],
                      ['aircraft', 'Aircraft'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-[10px]">
                        <span className="w-20 uppercase tracking-wider text-muted text-[9px]">{label}</span>
                        <input
                          className={inputCls + ' flex-1'}
                          type="number" min={1} step={1} disabled={!canGovern}
                          value={draft.tariffs?.[key] ?? draft.payout}
                          onChange={(e) => setTariff(key, num(e.target.value, draft.payout))}
                        />
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-[10px]">
                      <span className="w-20 uppercase tracking-wider text-muted text-[9px]">fallback</span>
                      <input
                        className={inputCls + ' flex-1'}
                        type="number" min={1} step={1} disabled={!canGovern}
                        value={draft.payout}
                        onChange={(e) => setDraft({ ...draft, payout: Math.max(1, Math.round(num(e.target.value, draft.payout))) })}
                      />
                    </label>
                  </div>
                </div>

                {canGovern ? (
                  <button
                    type="button"
                    disabled={save.isPending || (!!ruleQ.data && JSON.stringify(draft) === JSON.stringify(ruleQ.data.rule))}
                    onClick={() => save.mutate(draft)}
                    className="flex items-center justify-center gap-2 border border-cyan text-cyan text-[10px] font-semibold uppercase tracking-[0.2em] py-1.5 hover:bg-cyan/10 disabled:opacity-40"
                  >
                    <Save size={12} />
                    {save.isPending ? 'saving…' : 'save policy'}
                  </button>
                ) : (
                  <div className="text-[9px] text-muted">viewing as {role ?? '…'} — editing requires government or admin</div>
                )}
                {save.isError && <div className="text-[9px] text-red">{(save.error as Error).message}</div>}
                <div className="text-[9px] text-muted leading-relaxed">
                  The settle-agent enforces this exact policy on every engagement — tariff by target
                  class, freeze below the confidence floor. Changes take effect on the next run.
                </div>
              </div>
            )}
          </div>

          <UnitBalancesPanel />
        </aside>

        <main className="flex-1 min-w-0 p-3 flex flex-col gap-3 overflow-y-auto">
          <div className="border border-line bg-panel font-mono">
            <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Snowflake size={11} className="text-amber" /> Disputes — frozen pending review
              <span className="text-muted">({disputes.length})</span>
            </div>
            {disputes.length === 0 ? (
              <div className="p-4 text-[10px] text-muted text-center">
                no frozen engagements — the settle-agent freezes low-confidence or inconsistent downings for adjudication
              </div>
            ) : (
              <div className="flex flex-col">
                {disputes.map((e) => (
                  <DisputeRow
                    key={e._id}
                    engagement={e}
                    pending={resolvingId === e._id}
                    disabled={!canGovern || resolve.isPending}
                    onResolve={(action) => resolve.mutate({ id: e._id, action })}
                  />
                ))}
              </div>
            )}
          </div>

          <EngagementList />
        </main>

        <aside className="w-[380px] shrink-0 min-h-0">
          <LedgerPanel />
        </aside>
      </div>
    </div>
  );
}

function DisputeRow({
  engagement,
  pending,
  disabled,
  onResolve,
}: {
  engagement: Engagement;
  pending: boolean;
  disabled: boolean;
  onResolve: (action: 'release' | 'deny') => void;
}) {
  const a = engagement.agentA.verdict;
  const b = engagement.agentB.verdict;
  return (
    <div className="px-3 py-2.5 border-b border-line/60 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-ink font-semibold">{engagement._id}</span>
        <span className="text-muted">unit {engagement.unitId}</span>
        <div className="flex-1" />
        <span className="text-[9px] uppercase tracking-wider text-muted border border-line px-1">
          {a.classification.replace(/_/g, ' ')} {Math.round(a.confidence * 100)}%
        </span>
      </div>
      <div className="text-[10px] text-muted">{engagement.settlement.reason}</div>
      <div className="text-[9px] text-muted uppercase tracking-wider flex gap-3">
        <span>A: {a.is_threat ? 'threat' : 'no threat'} · {Math.round(a.confidence * 100)}%</span>
        <span>B: {b.destroyed ? 'destroyed' : 'not destroyed'} · {b.evidence_type.replace(/_/g, ' ')} · {Math.round(b.confidence * 100)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => onResolve('release')}
          className="flex items-center gap-1.5 border border-green text-green text-[10px] uppercase tracking-wider px-2 py-1 hover:bg-green/10 disabled:opacity-40"
        >
          <CircleDollarSign size={11} /> {pending ? 'working…' : 'release payout'}
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => onResolve('deny')}
          className="border border-red text-red text-[10px] uppercase tracking-wider px-2 py-1 hover:bg-red/10 disabled:opacity-40"
        >
          deny claim
        </button>
      </div>
    </div>
  );
}
