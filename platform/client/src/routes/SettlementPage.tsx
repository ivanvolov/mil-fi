import { useEffect } from 'react';
import { AppRail } from '../components/AppRail';
import { DemoModeBanner } from '../components/settlement/DemoModeBanner';
import { StatusStrip } from '../components/settlement/StatusStrip';
import { RunPanel } from '../components/settlement/RunPanel';
import { RunProgress } from '../components/settlement/RunProgress';
import { OutcomeBanner } from '../components/settlement/OutcomeBanner';
import { AgentACard, AgentBCard } from '../components/settlement/VerdictCard';
import { EngagementList } from '../components/settlement/EngagementList';
import { LedgerPanel } from '../components/settlement/LedgerPanel';
import { UnitBalancesPanel } from '../components/settlement/UnitBalancesPanel';
import { useEngagements, useMyUnit } from '../queries/useSettlement';
import { useSettlementStore } from '../stores/settlementStore';
import { useMe } from '../queries/useMe';

/** Role-specific framing of the same console: military files claims, government
 *  oversees money + rules, admin sees the whole settlement story. */
const HEADERS = {
  military: { title: 'CLAIMS', sub: 'file engagement → agents verify → payout' },
  government: { title: 'GOVERN', sub: 'rules · unit balances · evidence trail' },
  default: { title: 'SETTLEMENT', sub: 'verified downing → autonomous payout' },
} as const;

/**
 * Settlement Console: the whole MilFi story on one screen — report → Agent A
 * (0G) → downing → Agent B (0G) → autonomous settle-agent paying DEFPOINT on
 * Hedera, with the immutable HCS evidence trail live on the right.
 * Role-adaptive: military sees only its own claims (unit bound in the DB) and
 * no all-units balance panel; government gets the oversight view.
 */
export function SettlementPage() {
  const role = useMe().data?.role;
  const myUnitId = useMyUnit().data?.unitId ?? null;
  const boundUnitId = role === 'military' ? myUnitId : null;
  const engagements = (useEngagements().data ?? []).filter(
    (e) => !boundUnitId || e.unitId === boundUnitId,
  );
  const selectedId = useSettlementStore((s) => s.selectedEngagementId);
  const select = useSettlementStore((s) => s.selectEngagement);
  const running = useSettlementStore((s) => s.runStage) !== 'idle';
  const header = HEADERS[role === 'military' || role === 'government' ? role : 'default'];

  // Default the detail view to the most recent engagement.
  useEffect(() => {
    if (!selectedId && engagements.length > 0) select(engagements[0]!._id);
  }, [selectedId, engagements, select]);

  const selected = engagements.find((e) => e._id === selectedId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <DemoModeBanner />
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em]">{header.title}</div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
          {header.sub}
        </div>
        <div className="flex-1" />
        <StatusStrip />
      </header>

      <div className="flex-1 flex min-h-0">
        <AppRail />

        <aside className="w-[340px] shrink-0 border-r border-line p-3 flex flex-col gap-3 overflow-y-auto">
          <RunPanel />
          {role !== 'military' && <UnitBalancesPanel />}
        </aside>

        <main className="flex-1 min-w-0 p-3 flex flex-col gap-3 overflow-y-auto">
          <RunProgress />
          {selected && !running && <OutcomeBanner engagement={selected} />}
          {selected && (
            <div className="flex gap-3 flex-wrap">
              <AgentACard run={selected.agentA} />
              <AgentBCard run={selected.agentB} />
            </div>
          )}
          {!selected && !running && (
            <div className="border border-line bg-panel font-mono p-6 text-center text-[11px] text-muted">
              no engagement selected — run one from the left panel, or pick a past run below
            </div>
          )}
          <EngagementList unitId={boundUnitId} />
        </main>

        <aside className="w-[380px] shrink-0 min-h-0">
          <LedgerPanel />
        </aside>
      </div>
    </div>
  );
}
