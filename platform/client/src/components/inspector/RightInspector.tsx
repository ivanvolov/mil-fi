import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Crosshair, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { Team } from '@shared/schemas/team';
import type { Threat } from '@shared/schemas/threat';
import type { ThreatType } from '@shared/schemas/threat-type';
import type { Drawing } from '@shared/schemas/drawing';
import { useUiStore, type SelectionItem } from '../../stores/uiStore';
import { Chip } from '../shared/Chip';
import { haversineKm } from '@shared/distance';
import { drawingKindFullLabel, drawingGeometryDesc } from '../../lib/drawing-labels';
import { BulkOrchestrationPanel } from './BulkOrchestrationPanel';
import {
  useDeleteInterceptor,
  useDeleteTeam,
  useDeleteThreat,
  useDeleteDrawing,
} from '../../queries/useMutations';

const C = {
  green: '#22c55e', amber: '#f59e0b', red: '#ef4444',
  cyan: '#06b6d4', gold: '#eab308', purple: '#a78bfa',
  muted: '#8b949e',
};

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-cyan border border-cyan/40 hover:border-cyan font-mono text-[10px] uppercase tracking-wider px-2 py-1 shrink-0"
    >
      <Pencil size={11} /> Edit
    </button>
  );
}

function Eyebrow({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.08em] font-mono" style={{ color }}>{children}</div>
  );
}

function BigId({ children, color }: { children: React.ReactNode; color?: string }) {
  return <div className="text-2xl font-bold font-mono mt-1" style={color ? { color } : undefined}>{children}</div>;
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 border-b border-line">{children}</div>;
}

function SpecRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 py-0.5 font-mono text-xs">
      <span className="text-muted uppercase text-[10px] tracking-wider">{k}</span>
      <span className="text-ink min-w-0 break-words">{v}</span>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-muted text-sm mb-1 font-mono">No asset selected</div>
        <div className="text-[10px] text-muted font-mono">click any marker on the map or any row in the list</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Multi-selection

const KIND_LABELS: Record<SelectionItem['kind'], { one: string; many: string }> = {
  interceptor: { one: 'launcher', many: 'launchers' },
  team: { one: 'crew', many: 'crews' },
  threat: { one: 'threat', many: 'threats' },
  drawing: { one: 'restriction', many: 'restrictions' },
};

function MultiSelectionPanel({
  data,
  selections,
}: { data: LayerFull; selections: SelectionItem[] }) {
  const slug = data.layer.slug;
  const layerId = data.layer._id;
  const setSelection = useUiStore((s) => s.setSelection);

  const deleteInterceptor = useDeleteInterceptor(slug);
  const deleteTeam = useDeleteTeam(slug);
  const deleteThreat = useDeleteThreat(slug);
  const deleteDrawing = useDeleteDrawing(slug);

  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setConfirm(false); }, [selections.length]);

  const counts = useMemo(() => {
    const c: Record<SelectionItem['kind'], number> = {
      interceptor: 0, team: 0, threat: 0, drawing: 0,
    };
    for (const s of selections) c[s.kind]++;
    return c;
  }, [selections]);

  const onDelete = async () => {
    if (!confirm) { setConfirm(true); return; }
    setBusy(true);
    try {
      await Promise.all(selections.map((s) => {
        if (s.kind === 'interceptor') return deleteInterceptor.mutateAsync({ layerId, id: s.id });
        if (s.kind === 'team') return deleteTeam.mutateAsync({ layerId, id: s.id });
        if (s.kind === 'threat') return deleteThreat.mutateAsync({ layerId, id: s.id });
        return deleteDrawing.mutateAsync({ layerId, id: s.id });
      }));
      setSelection(null);
    } catch { /* surfaced by each mutation's onError */ }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line">
        <Eyebrow color={C.cyan}>Multi-selection</Eyebrow>
        <BigId color={C.cyan}>{selections.length} selected</BigId>
        <div className="text-[10px] text-muted mt-1 font-mono">shift-click a marker or row to toggle</div>
      </div>
      <Section>
        <div className="space-y-1">
          {(['interceptor', 'team', 'threat', 'drawing'] as const).map((k) => (
            counts[k] > 0 && (
              <div key={k} className="flex items-center justify-between font-mono text-xs">
                <span className="text-ink uppercase tracking-wider text-[10px]">
                  {counts[k] === 1 ? KIND_LABELS[k].one : KIND_LABELS[k].many}
                </span>
                <span className="text-muted">{counts[k]}</span>
              </div>
            )
          ))}
        </div>
      </Section>
      <div className="px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="flex items-center gap-1.5 bg-red/10 border border-red text-red font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 hover:bg-red/20 disabled:opacity-50"
        >
          <Trash2 size={12} />
          {busy ? 'Deleting…' : confirm ? `Click again to delete ${selections.length}` : `Delete ${selections.length}`}
        </button>
        <button
          type="button"
          onClick={() => setSelection(null)}
          className="ml-auto bg-transparent border border-line text-muted font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 hover:text-ink hover:border-ink"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Launcher

function stateChip(i: Interceptor) {
  if (i.state === 'offline') return <Chip color={C.muted}>OFFLINE</Chip>;
  if (i.state === 'reload') return <Chip color={C.amber}>RELOAD{i.ammo?.reloadEtaSec != null ? ` · ${i.ammo.reloadEtaSec}s` : ''}</Chip>;
  if (i.ammo) return <Chip color={C.green}>READY · {i.ammo.ready}/{i.ammo.capacity}</Chip>;
  return <Chip color={C.green}>READY</Chip>;
}

function categoryColor(cat: string) {
  return cat === 'mfg' ? C.amber : cat === 'manpads' ? C.purple : C.cyan;
}

function LauncherCard({
  data, i, t,
}: { data: LayerFull; i: Interceptor; t: InterceptorType | undefined }) {
  const openEditor = useUiStore((s) => s.openEditor);
  const setSelection = useUiStore((s) => s.setSelection);

  const operatorThreads = useMemo(
    () => data.threads.filter((th) => th.interceptorId === i._id),
    [data.threads, i._id],
  );
  const operators = operatorThreads.map((th) => {
    const team = data.teams.find((tm) => tm._id === th.teamId);
    if (!team) return null;
    const distKm = haversineKm(team.position, i.position);
    return { team, kind: th.kind, distKm };
  }).filter(Boolean) as { team: Team; kind: 'primary' | 'override'; distKm: number }[];

  const needsCrew = t?.requiresCrew && operators.length === 0;

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{t?.displayName ?? 'unknown type'}</Eyebrow>
          <BigId>{i.code}</BigId>
          <div className="text-[10px] text-muted mt-1 font-mono">battlefield-wide code · {i.battlefieldCode}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stateChip(i)}
        </div>
      </div>

      {needsCrew && (
        <div className="px-4 py-2 border-b border-line bg-amber/5">
          <Chip color={C.amber}>NO CREW · NOT OPERATIONAL</Chip>
        </div>
      )}

      {i.ammo && t?.loadout.hasReload && (
        <Section>
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-line p-2 text-center">
              <div className="font-mono text-xl" style={{ color: C.green }}>{i.ammo.ready}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">ready</div>
            </div>
            <div className="border border-line p-2 text-center">
              <div className="font-mono text-xl" style={{ color: C.amber }}>{i.ammo.reload}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">reload</div>
            </div>
            <div className="border border-line p-2 text-center">
              <div className="font-mono text-xl text-muted">{i.ammo.capacity}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">capacity</div>
            </div>
          </div>
        </Section>
      )}

      <Section>
        <SpecRow k="Type" v={<>{t?.displayName ?? '?'}<span className="text-muted ml-1">· {t?.category}</span></>} />
        <SpecRow k="Position" v={<span className="font-mono">{i.position.lat.toFixed(5)} · {i.position.lng.toFixed(5)}</span>} />
      </Section>

      {t && (
        <Section>
          <div className="flex items-center justify-between mb-2">
            <Eyebrow color={categoryColor(t.category)}>Coverage</Eyebrow>
          </div>
          <SpecRow k="Range" v={<>{t.envelope.rangeKm} km</>} />
          <SpecRow k="Max alt" v={<>{t.envelope.altMaxM.toLocaleString()} m</>} />
          {t.category !== 'mfg' && <SpecRow k="Speed" v={<>{t.envelope.spdMaxKmh} km/h</>} />}
          <SpecRow k="Needs crew" v={t.requiresCrew ? 'yes' : 'self-operated'} />
        </Section>
      )}

      <Section>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Operator crew{operators.length > 1 ? 's' : ''}</Eyebrow>
          <Chip color={C.cyan}>{operators.length} crew{operators.length === 1 ? '' : 's'}</Chip>
        </div>
        <div className="space-y-1">
          {operators.length === 0 && <div className="text-[11px] text-muted">— none —</div>}
          {operators.map((o) => {
            const remote = o.distKm > 8;
            return (
              <div
                key={o.team._id}
                onClick={() => setSelection({ kind: 'team', id: o.team._id })}
                className="border border-line px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:border-cyan/50"
                title={o.team.role}
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm" style={{ color: o.kind === 'override' ? C.amber : C.cyan }}>{o.team.code}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wider truncate">{o.team.role}</div>
                </div>
                <div className="text-[10px] font-mono shrink-0 text-right" style={{ color: o.kind === 'override' ? C.amber : remote ? C.amber : C.green }}>
                  {o.distKm.toFixed(1)} km<br />{o.kind === 'override' ? 'override' : remote ? 'remote' : 'local'}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <div className="px-4 py-2 border-b border-line flex justify-end">
        <EditButton onClick={() => openEditor({ kind: 'interceptor', id: i._id })} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Threat

function TrajectoryLegend() {
  // matches the polylines drawn in ThreatLayer
  return (
    <div className="space-y-1.5">
      <Eyebrow>Trajectory</Eyebrow>
      <div className="space-y-1 font-mono text-[11px] text-ink">
        <LegendRow color={C.gold} kind="solid" label="past path" />
        <LegendRow color={C.gold} kind="dashed" label="predicted cruise" />
        <LegendRow color={C.red} kind="dashed" label="predicted attack / descent" />
        <LegendRow color="#c2410c" kind="solid-box" label="divergence zone" />
        <LegendRow color={C.red} kind="circle" label="detonation radius" />
      </div>
    </div>
  );
}

function LegendRow({ color, kind, label }: { color: string; kind: 'solid' | 'dashed' | 'solid-box' | 'circle'; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 inline-flex justify-center">
        {kind === 'solid' && (
          <svg width="40" height="6"><line x1="2" y1="3" x2="38" y2="3" stroke={color} strokeWidth="2" /></svg>
        )}
        {kind === 'dashed' && (
          <svg width="40" height="6"><line x1="2" y1="3" x2="38" y2="3" stroke={color} strokeWidth="2" strokeDasharray="5 3" /></svg>
        )}
        {kind === 'solid-box' && (
          <svg width="40" height="14"><rect x="2" y="2" width="36" height="10" fill={`${color}22`} stroke={color} strokeWidth="1.3" /></svg>
        )}
        {kind === 'circle' && (
          <svg width="40" height="14"><circle cx="20" cy="7" r="6" fill={`${color}55`} stroke={color} strokeWidth="1.5" /></svg>
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

function ThreatCard({
  th, tt,
}: { th: Threat; tt: ThreatType | undefined }) {
  const openEditor = useUiStore((s) => s.openEditor);
  const det = th.geometry.detonation;
  const div = th.geometry.divergence;

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line">
        <Eyebrow color={C.red}>Inbound threat</Eyebrow>
        <BigId color={C.red}>{th.code}</BigId>
        <div className="text-[10px] text-muted mt-1 font-mono">battlefield-wide code · {th.battlefieldCode}</div>
      </div>
      <Section>
        <SpecRow k="Type" v={<>{tt?.displayName ?? '?'}<span className="text-muted ml-1">· {tt?.family}</span></>} />
        <SpecRow k="Altitude" v={<>{th.altitudeM} m</>} />
        <SpecRow k="Speed" v={<>{th.speedKmh} km/h</>} />
        <SpecRow k="Target" v={det ? <span className="font-mono">{det.lat.toFixed(5)} · {det.lng.toFixed(5)}</span> : '—'} />
        <SpecRow k="Position" v={<span className="font-mono">{th.position.lat.toFixed(5)} · {th.position.lng.toFixed(5)}</span>} />
      </Section>
      <Section>
        <TrajectoryLegend />
      </Section>
      {det && (
        <Section>
          <Eyebrow color={C.red}>Detonation</Eyebrow>
          <div className="mt-1.5">
            <SpecRow k="Center" v={<span className="font-mono">{det.lat.toFixed(5)} · {det.lng.toFixed(5)}</span>} />
            <SpecRow k="Radius" v={<>{det.radiusM} m</>} />
          </div>
        </Section>
      )}
      {div && (
        <Section>
          <Eyebrow color="#c2410c">Divergence zone</Eyebrow>
          <div className="mt-1.5">
            <SpecRow k="Width" v={<>{div.widthM} m</>} />
            <SpecRow k="Height" v={<>{div.heightM} m</>} />
          </div>
        </Section>
      )}
      <div className="px-4 py-2 border-b border-line flex items-center justify-end gap-2 flex-wrap">
        <EditButton onClick={() => openEditor({ kind: 'threat', id: th._id })} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Crew

function typeSubtitle(t: InterceptorType | undefined): string {
  if (!t) return '?';
  // first word of displayName
  return (t.displayName.split(/[\s(/]/)[0] ?? '').toUpperCase();
}

function CrewCard({ data, tm }: { data: LayerFull; tm: Team }) {
  const openEditor = useUiStore((s) => s.openEditor);
  const setSelection = useUiStore((s) => s.setSelection);
  const typesById = useMemo(() => {
    const m = new Map<string, InterceptorType>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const controls = useMemo(() => {
    return data.threads
      .filter((th) => th.teamId === tm._id)
      .map((th) => {
        const i = data.interceptors.find((x) => x._id === th.interceptorId);
        if (!i) return null;
        const t = typesById.get(i.typeId);
        const distKm = haversineKm(tm.position, i.position);
        return { i, t, kind: th.kind, distKm };
      })
      .filter(Boolean) as { i: Interceptor; t: InterceptorType | undefined; kind: 'primary' | 'override'; distKm: number }[];
  }, [data.threads, data.interceptors, tm, typesById]);

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line">
        <Eyebrow color={C.cyan}>Operator crew{tm.isElite ? ' · elite' : ''}</Eyebrow>
        <BigId color={C.cyan}>{tm.code}</BigId>
        <div className="text-[10px] text-muted mt-1 font-mono">battlefield-wide code · {tm.battlefieldCode}</div>
      </div>
      <Section>
        <SpecRow k="Position" v={<span className="font-mono">{tm.position.lat.toFixed(5)} · {tm.position.lng.toFixed(5)}</span>} />
      </Section>
      <Section>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Controls</Eyebrow>
          <Chip color={C.cyan}>{controls.length} launcher{controls.length === 1 ? '' : 's'}</Chip>
        </div>
        <div className="space-y-1">
          {controls.length === 0 && <div className="text-[11px] text-muted">— none —</div>}
          {controls.map(({ i, t, kind, distKm }) => {
            const remote = distKm > 8;
            return (
              <div
                key={i._id}
                onClick={() => setSelection({ kind: 'interceptor', id: i._id })}
                className="border border-line px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:border-cyan/50"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm text-ink">{i.code}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wider truncate">{typeSubtitle(t)}</div>
                </div>
                <div className="text-[10px] font-mono shrink-0 text-right" style={{ color: remote ? C.amber : C.green }}>
                  {distKm.toFixed(1)} km<br />{kind === 'override' ? 'override' : remote ? 'remote' : 'local'}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <div className="px-4 py-2 border-b border-line flex justify-end">
        <EditButton onClick={() => openEditor({ kind: 'team', id: tm._id })} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Drawing

function DrawingCard({ d }: { d: Drawing }) {
  const openEditor = useUiStore((s) => s.openEditor);
  const kindLabel = drawingKindFullLabel(d.kind);
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line">
        <Eyebrow color="#b04a3a">Restriction · {kindLabel}</Eyebrow>
        <BigId>{d.name ?? kindLabel}</BigId>
      </div>
      <Section>
        <SpecRow k="Kind" v={kindLabel} />
        <SpecRow k="Geometry" v={drawingGeometryDesc(d.geometry)} />
        <SpecRow k="Visible" v={d.visible ? 'yes' : 'no'} />
      </Section>
      <div className="px-4 py-2 border-b border-line flex justify-end">
        <EditButton onClick={() => openEditor({ kind: 'drawing', id: d._id })} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// A brief "thinking" beat shown when an orchestration view opens, so the result
// reads as the system computing assignments rather than appearing instantly.

const THINK_MS = 1000;

export function OrchestrationThinking() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <Crosshair size={26} className="animate-spin" style={{ color: C.cyan, animationDuration: '1.6s' }} />
      <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: C.cyan }}>
        Orchestrating · all threats
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: C.cyan, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <div className="font-mono text-[10px] text-muted">computing optimal assignments</div>
    </div>
  );
}

export function RightInspector({ data }: { data: LayerFull }) {
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const bulkOrchestrate = useUiStore((s) => s.bulkOrchestrate);
  const collapsed = useUiStore((s) => s.rightPanelCollapsed);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);

  // Play the "thinking" beat once each time bulk orchestration opens, so the panel reads
  // as the system computing assignments rather than appearing instantly.
  const [thinking, setThinking] = useState(false);
  const wasBulkRef = useRef(false);
  useEffect(() => {
    if (bulkOrchestrate && !wasBulkRef.current) {
      wasBulkRef.current = true;
      setThinking(true);
      const id = setTimeout(() => setThinking(false), THINK_MS);
      return () => clearTimeout(id);
    }
    if (!bulkOrchestrate) wasBulkRef.current = false;
  }, [bulkOrchestrate]);
  const typesIndex = useMemo(() => {
    const im = new Map<string, InterceptorType>();
    for (const t of data.types.interceptor) im.set(t._id, t);
    const tm = new Map<string, ThreatType>();
    for (const t of data.types.threat) tm.set(t._id, t);
    return { interceptor: im, threat: tm };
  }, [data.types]);

  let body: React.ReactNode = <Empty />;
  if (bulkOrchestrate) {
    body = thinking ? <OrchestrationThinking /> : <BulkOrchestrationPanel data={data} />;
  } else if (selections.length > 1) {
    body = <MultiSelectionPanel data={data} selections={selections} />;
  } else if (selection?.kind === 'interceptor') {
    const i = data.interceptors.find((x) => x._id === selection.id);
    if (i) body = <LauncherCard data={data} i={i} t={typesIndex.interceptor.get(i.typeId)} />;
  } else if (selection?.kind === 'team') {
    const tm = data.teams.find((x) => x._id === selection.id);
    if (tm) body = <CrewCard data={data} tm={tm} />;
  } else if (selection?.kind === 'threat') {
    const th = data.threats.find((x) => x._id === selection.id);
    if (th) body = <ThreatCard th={th} tt={typesIndex.threat.get(th.typeId)} />;
  } else if (selection?.kind === 'drawing') {
    const d = data.drawings.find((x) => x._id === selection.id);
    if (d) body = <DrawingCard d={d} />;
  }

  return (
    <div className="flex min-h-0">
      {/* Full-height toggle strip — a big touch target so the panel can be collapsed on tablets. */}
      <button
        type="button"
        onClick={toggleRightPanel}
        title={collapsed ? 'Expand panel' : 'Collapse panel'}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
        aria-expanded={!collapsed}
        className="w-5 shrink-0 border-l border-line bg-panel flex items-center justify-center text-muted hover:text-cyan"
      >
        {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      {!collapsed && (
        <aside className="w-[324px] border-l border-line bg-panel flex flex-col overflow-y-auto">
          {body}
        </aside>
      )}
    </div>
  );
}
