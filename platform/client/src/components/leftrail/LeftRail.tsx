import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { Plus, Camera, ScanEye, Crosshair, CheckCheck, Coins, ScrollText, EyeOff, ZoomIn } from 'lucide-react';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { TeamCreate } from '@shared/schemas/team';
import type { DrawingCreate, DrawingKind } from '@shared/schemas/drawing';
import { useUiStore, isSelected, type SelectionKind } from '../../stores/uiStore';
import { useCreateTeam, useCreateDrawing } from '../../queries/useMutations';
import { useMe, type Role } from '../../queries/useMe';
import { drawingKindShortLabel, drawingKindFullLabel, drawingGeometryDesc } from '../../lib/drawing-labels';
import { LauncherCreateDialog } from '../dialogs/LauncherCreateDialog';
import { ThreatSimulatorDialog } from '../dialogs/ThreatSimulatorDialog';
import { AssetManagerDialog } from '../dialogs/AssetManagerDialog';

/** The 6 steps of one engagement, per docs/03-architecture-bounty-map.md ("Поток одного
 *  сбития"). Each button jumps to the workspace where that step actually runs:
 *  spotting on /spotter, everything else in the settlement console (`to`).
 *  `roles` = who sees the button. Agent/settle steps are autonomous pipeline stages —
 *  military/government meet them as verdict cards + ledger entries over there. */
const FLOW_STEPS: Array<{
  key: string; label: string; icon: typeof Camera; partner: string; color: string;
  desc: string; roles: Role[]; to: string;
}> = [
  {
    key: 'report', label: 'Report Threat', icon: Camera, partner: 'WORLD', color: '#06b6d4',
    roles: ['spotter', 'admin'], to: '/spotter',
    desc: 'Spotter (level 2, Selfie-verified) submits photo + coordinates + time. Entry point of the whole funnel.',
  },
  {
    key: 'agent-a', label: 'Verify · Agent A', icon: ScanEye, partner: '0G', color: '#a78bfa',
    roles: ['admin'], to: '/settlement',
    desc: 'Vision agent on 0G Compute: threat or not, class (Shahed / UAV / aircraft), confidence 0..1. TEE-sealed inference. Runs inside the engagement pipeline.',
  },
  {
    key: 'engage', label: 'Record Engagement', icon: Crosshair, partner: 'HCS', color: '#f59e0b',
    roles: ['military', 'admin'], to: '/settlement',
    desc: 'Unit (level 3, document-verified) engages the target. File the claim: pre-strike + post-strike photos → agents verify → payout.',
  },
  {
    key: 'agent-b', label: 'Confirm Kill · Agent B', icon: CheckCheck, partner: '0G', color: '#a78bfa',
    roles: ['military', 'admin'], to: '/settlement',
    desc: 'The post-strike photo goes to the second 0G agent: target gone / debris / detonation signature, consistent with Agent A. Part of the same claim.',
  },
  {
    key: 'settle', label: 'Settle & Pay', icon: Coins, partner: 'HEDERA', color: '#f59e0b',
    roles: ['government', 'admin'], to: '/settlement',
    desc: 'Settle-agent reads the HCS journal, applies the government rule (≥95% + kill confirmed), checks World human-backing, pays DEFPOINT via HTS.',
  },
  {
    key: 'ledger', label: 'Evidence Ledger', icon: ScrollText, partner: 'HEDERA', color: '#f59e0b',
    roles: ['government', 'military', 'admin'], to: '/settlement',
    desc: 'Full audit trail on Hedera HCS: photo hashes, both verdicts, payout receipt — consensus-timestamped, auditable on HashScan.',
  },
];

function Accordion({
  label,
  count,
  onCreate,
  createDisabledReason,
  createLabel,
  createSlot,
  children,
}: {
  label: string;
  count: number;
  onCreate?: () => void;
  createDisabledReason?: string;
  createLabel: string;
  /** Overrides the default "+" button entirely — pass a custom trigger (e.g. a Popover). */
  createSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="accordion-head" onClick={() => setOpen((v) => !v)}>
        <span>{open ? '▾' : '▸'} {label}</span>
        <span
          className="ml-auto flex items-center gap-2"
          onClick={(e) => { if (createSlot) e.stopPropagation(); }}
        >
          <span className="count">{count}</span>
          {createSlot ?? (onCreate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!createDisabledReason) onCreate(); }}
              disabled={!!createDisabledReason}
              title={createDisabledReason ?? createLabel}
              aria-label={createLabel}
              className="text-muted hover:text-cyan border border-line hover:border-cyan w-5 h-5 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-line"
            >
              <Plus size={11} />
            </button>
          ))}
        </span>
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

/** Always visible (not hover-gated) — the app runs on tablets where hover doesn't exist,
 *  and ⌘/Ctrl+click (the desktop zoom gesture) isn't available there either. */
function RowZoomButton({ onZoom }: { onZoom: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onZoom(); }}
      title="Zoom to on map"
      aria-label="Zoom to on map"
      className="shrink-0 text-muted hover:text-cyan flex items-center justify-center w-5 h-5"
    >
      <ZoomIn size={12} />
    </button>
  );
}

function Row({
  selected,
  rowId,
  sub,
  chip,
  onClick,
  onZoom,
}: {
  selected: boolean;
  rowId: string;
  sub: string;
  chip?: string;
  onClick: (e: React.MouseEvent) => void;
  onZoom: () => void;
}) {
  return (
    <div
      className={`asset-row group ${selected ? 'selected' : ''}`}
      onClick={onClick}
      // Shift-click multi-selects; suppress the browser's shift-click text selection.
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
    >
      <span className="row-id">{rowId}</span>
      <span className="row-sub" title={sub}>{sub}</span>
      {chip && <span className="chip-noop">{chip}</span>}
      <RowZoomButton onZoom={onZoom} />
    </div>
  );
}

function getMapCenter(data: LayerFull): LatLng {
  const view = useUiStore.getState().mapViewByLayer[data.layer._id];
  return view ? view.center : data.layer.mapCenter;
}

/** Crews use `C<n>` codes so they can never read as a threat code (threats are `T-<n>`).
 *  Numbering scans existing crew codes and picks the smallest unused integer ≥ 1. */
function nextCrewCode(existingCodes: string[]): string {
  const used = new Set<number>();
  for (const code of existingCodes) {
    const m = /^C(\d+)$/.exec(code);
    if (m && m[1]) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `C${n}`;
}

/** Regular N-gon around `center` with the given radius in meters. Starts at "north" (top vertex). */
function regularPolygonPoints(center: LatLng, n: number, radiusM: number): LatLng[] {
  const metersPerLatDeg = 111320;
  const metersPerLngDeg = 111320 * Math.cos((center.lat * Math.PI) / 180);
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + Math.PI / 2; // +π/2 puts first vertex due north
    out.push({
      lat: center.lat + (radiusM * Math.sin(angle)) / metersPerLatDeg,
      lng: center.lng + (radiusM * Math.cos(angle)) / metersPerLngDeg,
    });
  }
  return out;
}

export function LeftRail({ data }: { data: LayerFull }) {
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const setSelection = useUiStore((s) => s.setSelection);
  const openEditor = useUiStore((s) => s.openEditor);
  const visibility = useUiStore((s) => s.visibility);
  const { slug = 'vzil-1' } = useParams();

  const restrictionPolygonPoints = useUiStore((s) => s.restrictionPolygonPoints);
  const setRestrictionPolygonPoints = useUiStore((s) => s.setRestrictionPolygonPoints);

  const createTeam = useCreateTeam(slug);
  const createDrawing = useCreateDrawing(slug);
  const [launcherCreateOpen, setLauncherCreateOpen] = useState(false);
  const navigate = useNavigate();

  // Role gating: undefined while /auth/me loads → most-restricted view (no flash of
  // privileged UI). Server enforces the same rules on every mutation.
  const role = useMe().data?.role;
  const isSpotter = role === 'spotter';
  const visibleFlowSteps = role ? FLOW_STEPS.filter((s) => s.roles.includes(role)) : [];

  const requestDemoStrike = useUiStore((s) => s.requestDemoStrike);
  const demoStrikePlaying = useUiStore((s) => s.demoStrikePlaying);
  const demoStrikeStatus = useUiStore((s) => s.demoStrikeStatus);

  // Shift and ⌘/Ctrl are orthogonal modifiers: Shift = additive selection, ⌘/Ctrl = zoom.
  //   Plain click            → single-select (or deselect if the sole selected row).
  //   Shift click            → toggle in/out of the multi-selection. No map movement.
  //   ⌘/Ctrl click           → single-select + flyTo the item.
  //   Shift + ⌘/Ctrl click   → toggle in/out of the multi-selection + refit bounds to all.
  // Zooming NEVER happens without ⌘/Ctrl held; plain click and Shift-only never move the map.
  const toggleSelect = (kind: SelectionKind, id: string, e?: React.MouseEvent) => {
    const shift = !!e?.shiftKey;
    const cmd = !!(e && (e.metaKey || e.ctrlKey));
    if (shift) { setSelection({ kind, id }, { additive: true, zoom: cmd }); return; }
    const isCurrent = selection?.kind === kind && selection.id === id;
    if (cmd) setSelection({ kind, id }, { zoom: true });
    else if (isCurrent) setSelection(null);
    else setSelection({ kind, id });
  };

  const typesById = useMemo(() => {
    const m = new Map<string, { displayName: string; category: string; requiresCrew: boolean }>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const threatTypesById = useMemo(() => {
    const m = new Map<string, { displayName: string; family: string }>();
    for (const t of data.types.threat) m.set(t._id, t);
    return m;
  }, [data.types.threat]);

  const threadsByInterceptor = useMemo(() => {
    const m = new Map<string, number>();
    for (const th of data.threads) m.set(th.interceptorId, (m.get(th.interceptorId) ?? 0) + 1);
    return m;
  }, [data.threads]);

  const interceptors = useMemo(
    () => [...data.interceptors].sort((a, b) => a.code.localeCompare(b.code)),
    [data.interceptors],
  );
  const teams = useMemo(() => [...data.teams].sort((a, b) => a.code.localeCompare(b.code)), [data.teams]);
  const threats = useMemo(() => [...data.threats].sort((a, b) => a.code.localeCompare(b.code)), [data.threats]);

  const onCreateTeam = async () => {
    const center = getMapCenter(data);
    const body: TeamCreate = {
      code: nextCrewCode(data.teams.map((t) => t.code)),
      battlefieldCode: '',
      position: center,
      role: 'local crew',
      isElite: false,
    };
    try {
      const created = await createTeam.mutateAsync({ layerId: data.layer._id, body });
      setSelection({ kind: 'team', id: created._id });
      openEditor({ kind: 'team', id: created._id });
    } catch { /* surfaced by mutation onError */ }
  };

  const onCreateRestriction = async (kind: DrawingKind) => {
    const center = getMapCenter(data);
    const n = Math.max(3, Math.min(32, restrictionPolygonPoints));
    const points = regularPolygonPoints(center, n, 500);
    const style =
      kind === 'noPlacementZone'
        ? { stroke: '#a855f7', fill: '#a855f7', patternId: null, weight: 2, dashArray: '6 4' }
        : { stroke: '#b04a3a', fill: '#b04a3a', patternId: 'brick-hatch', weight: 2, dashArray: null };
    const body: DrawingCreate = {
      kind,
      name: null,
      geometry: { type: 'polygon', points },
      style,
      visible: true,
    };
    try {
      const created = await createDrawing.mutateAsync({ layerId: data.layer._id, body });
      setSelection({ kind: 'drawing', id: created._id });
      openEditor({ kind: 'drawing', id: created._id });
    } catch { /* surfaced by mutation onError */ }
  };

  return (
    <aside className="w-[260px] border-r border-line bg-panel flex flex-col overflow-y-auto">
      {visibility.threats && (
        <Accordion label="Threats" count={threats.length} createLabel="Add threat">
          {threats.map((t) => {
            const tt = threatTypesById.get(t.typeId);
            return (
              <Row
                key={t._id}
                selected={isSelected(selections, 'threat', t._id)}
                rowId={t.code}
                sub={`${tt?.displayName ?? '?'} · ${t.altitudeM}m / ${t.speedKmh}km/h`}
                onClick={(e) => toggleSelect('threat', t._id, e)}
                onZoom={() => setSelection({ kind: 'threat', id: t._id }, { zoom: true })}
              />
            );
          })}
        </Accordion>
      )}

      {/* Opsec: spotters (civilian level 2) never see air-defense assets — crews and
          launchers are hidden from the list AND from the map layers. */}
      {visibility.teams && !isSpotter && (
        <Accordion
          label="Crews"
          count={teams.length}
          onCreate={onCreateTeam}
          createLabel="Add crew"
        >
          {teams.map((t) => (
            <Row
              key={t._id}
              selected={isSelected(selections, 'team', t._id)}
              rowId={t.code}
              sub={t.role}
              onClick={(e) => toggleSelect('team', t._id, e)}
              onZoom={() => setSelection({ kind: 'team', id: t._id }, { zoom: true })}
            />
          ))}
        </Accordion>
      )}

      {visibility.interceptors && !isSpotter && (
        <Accordion
          label="Launchers"
          count={interceptors.length}
          onCreate={() => setLauncherCreateOpen(true)}
          createDisabledReason={data.types.interceptor.length === 0 ? 'no interceptor types defined yet' : undefined}
          createLabel="Add launcher"
        >
          {interceptors.map((l) => {
            const lt = typesById.get(l.typeId);
            const threadCount = threadsByInterceptor.get(l._id) ?? 0;
            const needsCrew = lt?.requiresCrew && threadCount === 0;
            return (
              <Row
                key={l._id}
                selected={isSelected(selections, 'interceptor', l._id)}
                rowId={l.code}
                sub={`${lt?.displayName ?? '?'}`}
                chip={needsCrew ? 'NO CREW' : undefined}
                onClick={(e) => toggleSelect('interceptor', l._id, e)}
                onZoom={() => setSelection({ kind: 'interceptor', id: l._id }, { zoom: true })}
              />
            );
          })}
        </Accordion>
      )}

      {visibility.restrictions && (
        <Accordion
          label="Restrictions"
          count={data.drawings.length}
          createLabel="Add restriction"
          createSlot={
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title="Add restriction"
                  aria-label="Add restriction"
                  className="text-muted hover:text-cyan border border-line hover:border-cyan w-5 h-5 flex items-center justify-center"
                >
                  <Plus size={11} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="bg-panel border border-line shadow-2xl z-[2000] w-64 p-1 font-mono text-xs"
                  sideOffset={4}
                  align="end"
                >
                  <Popover.Close asChild>
                    <button
                      type="button"
                      onClick={() => onCreateRestriction('noEngagementZone')}
                      className="w-full flex items-center gap-2 px-2 py-1.5 outline-none hover:bg-bg/60 text-left"
                    >
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#b04a3a' }} />
                      <span className="flex flex-col">
                        <span className="text-ink">No-interception zone</span>
                        <span className="text-muted text-[10px]">Visual only. Marks where interception is disallowed.</span>
                      </span>
                    </button>
                  </Popover.Close>
                  <Popover.Close asChild>
                    <button
                      type="button"
                      onClick={() => onCreateRestriction('noPlacementZone')}
                      className="w-full flex items-center gap-2 px-2 py-1.5 outline-none hover:bg-bg/60 text-left"
                    >
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#a855f7' }} />
                      <span className="flex flex-col">
                        <span className="text-ink">No-placement zone</span>
                        <span className="text-muted text-[10px]">Asset Manager avoids placing launchers/crews inside.</span>
                      </span>
                    </button>
                  </Popover.Close>
                  <div className="flex items-center gap-2 px-2 py-1.5 border-t border-line mt-1">
                    <span className="text-muted text-[10px] uppercase tracking-wider">Points</span>
                    <input
                      type="number"
                      min={3}
                      max={32}
                      step={1}
                      value={restrictionPolygonPoints}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) setRestrictionPolygonPoints(v);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-16 bg-bg border border-line px-1.5 py-0.5 text-ink text-xs focus:outline-none focus:border-cyan"
                      aria-label="Number of polygon points (3–32)"
                    />
                    <span className="text-muted text-[10px]">3–32 vertices</span>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          }
        >
          {data.drawings.map((d) => (
            <div
              key={d._id}
              className={`asset-row ${isSelected(selections, 'drawing', d._id) ? 'selected' : ''}`}
              onClick={(e) => toggleSelect('drawing', d._id, e)}
              onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
            >
              <span className="row-id">{drawingKindShortLabel(d.kind)}</span>
              <span className="row-sub" title={d.name ?? ''}>{d.name ?? drawingKindFullLabel(d.kind)} · {drawingGeometryDesc(d.geometry)}</span>
              {!d.visible && <EyeOff size={12} className="chip-noop shrink-0" style={{ color: '#8b949e' }} aria-label="Hidden" />}
              <RowZoomButton onZoom={() => setSelection({ kind: 'drawing', id: d._id }, { zoom: true })} />
            </div>
          ))}
        </Accordion>
      )}
      {/* spacer: clicking the empty area below the lists clears the selection */}
      <div className="flex-1 min-h-[40px]" onClick={() => setSelection(null)} aria-label="clear selection" />

      {/* Engagement flow nav (Report Threat → Evidence Ledger) hidden for the map demo —
          it's redundant with the Sector/Spot/Settle tabs in AppRail and was cluttering the
          sector view. Not deleted: flip `false &&` back on if it's needed again. */}
      {false && (
        <div className="px-2 py-2 border-t border-line space-y-1.5">
          {visibleFlowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => navigate(step.to)}
                title={step.desc}
                className="w-full flex items-center gap-1.5 border font-mono text-[10px] uppercase tracking-wider px-2 py-1.5 border-line hover:border-cyan text-muted hover:text-cyan"
              >
                <Icon size={12} className="shrink-0" />
                <span className="flex-1 text-left">{step.label}</span>
                <span className="text-[8px] tracking-wider" style={{ color: step.color }}>{step.partner}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Demo: one button, picks/spawns a threat and animates its intercept — works in both
          2D and 3D (whichever map host is mounted picks up the request). Hidden for spotters,
          same opsec rule as the rest of the air-defense picture. */}
      {!isSpotter && (
        <div className="px-2 py-2 border-t border-line space-y-1">
          <button
            type="button"
            onClick={() => requestDemoStrike()}
            disabled={demoStrikePlaying}
            className="w-full border border-cyan bg-cyan/10 text-cyan font-mono text-[10px] uppercase tracking-wider px-2 py-1.5 hover:bg-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {demoStrikePlaying ? 'Engaging…' : '▶ Simulate intercept'}
          </button>
          {demoStrikeStatus && (
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted truncate">
              {demoStrikeStatus}
            </div>
          )}
        </div>
      )}

      <LauncherCreateDialog
        open={launcherCreateOpen}
        onOpenChange={setLauncherCreateOpen}
        slug={slug}
        data={data}
      />
      <ThreatSimulatorDialog slug={slug} data={data} />
      <AssetManagerDialog slug={slug} data={data} />
    </aside>
  );
}
