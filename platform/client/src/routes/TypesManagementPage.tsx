import { useEffect, useState } from 'react';
import { useInterceptorTypes, useThreatTypes } from '../queries/useTypes';
import { useUpdateThreatTypeFields, useDuplicateThreatType } from '../queries/useMutations';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { ThreatType } from '@shared/schemas/threat-type';
import { useUiStore } from '../stores/uiStore';
import { AppRail } from '../components/AppRail';

type Tab = 'interceptor' | 'threat' | 'defaults';

export function TypesManagementPage() {
  const [tab, setTab] = useState<Tab>('interceptor');
  const iTypes = useInterceptorTypes();
  const tTypes = useThreatTypes();

  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em]">CATALOG</div>
        <div className="flex-1" />
      </header>
      <div className="flex-1 flex min-h-0">
        <AppRail />
        <aside className="w-[200px] border-r border-line bg-panel">
          <button
            type="button"
            className={`w-full text-left px-4 py-3 font-mono text-xs uppercase tracking-wider border-l-2 ${tab === 'interceptor' ? 'border-cyan bg-bg/40 text-cyan' : 'border-transparent text-muted hover:text-ink'}`}
            onClick={() => setTab('interceptor')}
          >
            Interceptor types ({iTypes.data?.length ?? '…'})
          </button>
          <button
            type="button"
            className={`w-full text-left px-4 py-3 font-mono text-xs uppercase tracking-wider border-l-2 ${tab === 'threat' ? 'border-cyan bg-bg/40 text-cyan' : 'border-transparent text-muted hover:text-ink'}`}
            onClick={() => setTab('threat')}
          >
            Threat types ({tTypes.data?.length ?? '…'})
          </button>
          <button
            type="button"
            className={`w-full text-left px-4 py-3 font-mono text-xs uppercase tracking-wider border-l-2 ${tab === 'defaults' ? 'border-cyan bg-bg/40 text-cyan' : 'border-transparent text-muted hover:text-ink'}`}
            onClick={() => setTab('defaults')}
          >
            Defaults
          </button>
        </aside>
        <main className="flex-1 overflow-y-auto p-5">
          {tab === 'interceptor' && <InterceptorTypeTable rows={iTypes.data ?? []} />}
          {tab === 'threat' && <ThreatTypeTable rows={tTypes.data ?? []} />}
          {tab === 'defaults' && <DefaultsPanel />}
        </main>
      </div>
    </div>
  );
}

function InterceptorTypeTable({ rows }: { rows: InterceptorType[] }) {
  return (
    <table className="w-full font-mono text-xs">
      <thead className="text-muted text-[10px] uppercase tracking-wider">
        <tr className="border-b border-line">
          <th className="text-left p-2">Key</th>
          <th className="text-left p-2">Display name</th>
          <th className="text-left p-2">Category</th>
          <th className="text-left p-2">Crew?</th>
          <th className="text-right p-2">Range km</th>
          <th className="text-right p-2">Alt m</th>
          <th className="text-right p-2">Speed km/h</th>
          <th className="text-right p-2">Capacity</th>
          <th className="text-right p-2">Reload s</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id} className="border-b border-line/40 hover:bg-panel">
            <td className="p-2 text-muted">{r.key}</td>
            <td className="p-2">{r.displayName}</td>
            <td className="p-2 text-muted">{r.category}</td>
            <td className="p-2">{r.requiresCrew ? <span className="text-cyan">yes</span> : <span className="text-amber">self</span>}</td>
            <td className="p-2 text-right">{r.envelope.rangeKm}</td>
            <td className="p-2 text-right">{r.envelope.altMaxM}</td>
            <td className="p-2 text-right">{r.envelope.spdMaxKmh}</td>
            <td className="p-2 text-right">{r.loadout.hasReload ? r.loadout.defaultCapacity : '—'}</td>
            <td className="p-2 text-right">{r.loadout.hasReload ? r.loadout.defaultReloadSec : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `${base}` or the first free `${base}-N` not already taken. */
function uniqueTypeKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function ThreatTypeTable({ rows }: { rows: ThreatType[] }) {
  const duplicate = useDuplicateThreatType();
  const takenKeys = new Set(rows.map((r) => r.key));

  function onDuplicate(row: ThreatType) {
    duplicate.mutate({
      key: uniqueTypeKey(`${row.key}-copy`, takenKeys),
      displayName: `${row.displayName} (copy)`,
      family: row.family,
      typicalSpeedKmh: row.typicalSpeedKmh,
      typicalAltitudeM: row.typicalAltitudeM,
      warheadKg: row.warheadKg,
      descentPhaseM: row.descentPhaseM ?? 500,
      notes: row.notes,
    });
  }

  return (
    <table className="w-full font-mono text-xs">
      <thead className="text-muted text-[10px] uppercase tracking-wider">
        <tr className="border-b border-line">
          <th className="text-left p-2">Key</th>
          <th className="text-left p-2">Display name</th>
          <th className="text-left p-2">Family</th>
          <th className="text-right p-2">Speed</th>
          <th className="text-right p-2">Alt min</th>
          <th className="text-right p-2">Alt max</th>
          <th className="text-right p-2">Warhead kg</th>
          <th className="text-right p-2">Descent m</th>
          <th className="text-right p-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id} className="border-b border-line/40 hover:bg-panel">
            <td className="p-2 text-muted">{r.key}</td>
            <td className="p-2">{r.displayName}</td>
            <td className="p-2 text-muted">{r.family}</td>
            <td className="p-2 text-right">{r.typicalSpeedKmh}</td>
            <td className="p-2 text-right">{r.typicalAltitudeM.min}</td>
            <td className="p-2 text-right">{r.typicalAltitudeM.max}</td>
            <td className="p-2 text-right">{r.warheadKg ?? '—'}</td>
            <td className="p-2 text-right"><DescentCell row={r} /></td>
            <td className="p-2 text-right">
              <button
                type="button"
                onClick={() => onDuplicate(r)}
                disabled={duplicate.isPending}
                className="text-cyan border border-cyan/40 hover:border-cyan px-2 py-0.5 uppercase tracking-wider text-[10px] disabled:opacity-40"
              >
                Duplicate
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Editable terminal descent-phase length (m) for a threat type. Commits on Enter/blur; this is
 *  the default new threats of this type inherit (existing threats keep their own value). */
function DescentCell({ row }: { row: ThreatType }) {
  const update = useUpdateThreatTypeFields();
  const current = row.descentPhaseM ?? 500;
  const [draft, setDraft] = useState(String(current));
  useEffect(() => { setDraft(String(current)); }, [current]);

  function commit() {
    const v = Number.parseInt(draft, 10);
    if (!Number.isFinite(v) || v < 0) { setDraft(String(current)); return; }
    if (v === current) return;
    update.mutate({ id: row._id, patch: { descentPhaseM: v }, version: row.version });
  }

  return (
    <input
      type="number"
      min={0}
      value={draft}
      disabled={update.isPending}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      onBlur={commit}
      className="w-20 bg-bg border border-line px-1.5 py-0.5 text-ink text-right font-mono text-xs focus:outline-none focus:border-cyan disabled:opacity-50"
      aria-label={`Descent phase (m) for ${row.displayName}`}
    />
  );
}

function DefaultsPanel() {
  const n = useUiStore((s) => s.restrictionPolygonPoints);
  const setN = useUiStore((s) => s.setRestrictionPolygonPoints);
  const cellKm = useUiStore((s) => s.heatmapCellKm);
  const setCellKm = useUiStore((s) => s.setHeatmapCellKm);

  // String mirrors so the fields can be cleared / typed freely. Valid input commits to the store
  // (setters clamp to their ranges); blur snaps the display back to the canonical stored value.
  const [draft, setDraft] = useState(String(n));
  useEffect(() => { setDraft(String(n)); }, [n]);
  const [cellDraft, setCellDraft] = useState(String(cellKm));
  useEffect(() => { setCellDraft(String(cellKm)); }, [cellKm]);

  return (
    <div className="max-w-md font-mono text-xs">
      <div className="text-muted uppercase tracking-wider text-[10px] mb-3">Restriction defaults</div>
      <div className="border border-line p-4 space-y-3">
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Restriction vertices</div>
          <input
            type="number"
            min={3}
            max={32}
            placeholder="6"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setN(v);
            }}
            onBlur={() => setDraft(String(useUiStore.getState().restrictionPolygonPoints))}
            className="w-24 bg-bg border border-line px-2 py-1 text-ink focus:outline-none focus:border-cyan"
          />
          <div className="text-[10px] text-muted mt-1">
            Number of vertices for a new no-interception zone (3–32). Drop a restriction from the left rail and it spawns evenly distributed around the map center.
          </div>
        </label>
      </div>
      <div className="text-muted uppercase tracking-wider text-[10px] mb-3 mt-6">Heatmap defaults</div>
      <div className="border border-line p-4 space-y-3">
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Heatmap grid cell (km)</div>
          <input
            type="number"
            min={0.05}
            max={2}
            step={0.05}
            placeholder="0.25"
            value={cellDraft}
            onChange={(e) => {
              setCellDraft(e.target.value);
              const v = Number.parseFloat(e.target.value);
              if (Number.isFinite(v)) setCellKm(v);
            }}
            onBlur={() => setCellDraft(String(useUiStore.getState().heatmapCellKm))}
            className="w-24 bg-bg border border-line px-2 py-1 text-ink focus:outline-none focus:border-cyan"
          />
          <div className="text-[10px] text-muted mt-1">
            Cell size of the coverage heatmap grid in km (0.05–2). Smaller cells look finer but cost more to compute; very large areas are auto-coarsened to keep the map responsive.
          </div>
        </label>
      </div>
    </div>
  );
}
