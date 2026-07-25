import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { InterceptorCreate } from '@shared/schemas/interceptor';
import type { TeamCreate } from '@shared/schemas/team';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost } from '../shared/Dialog';
import { AssetChatPanel } from './AssetChatPanel';
import { useUiStore } from '../../stores/uiStore';
import { planMfgPlacement } from '@algos/placement/mfg-placement';
import { planLauncherPlacement } from '@algos/placement/launcher-placement';
import { planCrewPlacement, type LauncherKind } from '@algos/placement/crew-placement';
import { isLatLngInAnyZone } from '@algos/placement/placement-common';
import { npzRingsKm, currentDescentLengthKm } from '../../lib/assetPlanning';
import { MapCornerPanel } from '../shared/MapCornerPanel';
import {
  useCreateInterceptor,
  useCreateTeam,
  useCreateThread,
  useDeleteInterceptor,
  useDeleteTeam,
} from '../../queries/useMutations';

function getMapCenter(data: LayerFull): LatLng {
  const view = useUiStore.getState().mapViewByLayer[data.layer._id];
  return view ? view.center : data.layer.mapCenter;
}

/** One selected asset-type row: a weapon type plus how many of it you have (free text). */
type AssetRow = { typeId: string; count: string };

/** Parse a free-text count field; blank / invalid / negative all read as 0. */
function parseCount(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0;
}

/** Expand the selected rows into one InterceptorType per launcher. */
function expandLaunchers(types: InterceptorType[], rows: AssetRow[]): InterceptorType[] {
  const byId = new Map(types.map((t) => [t._id, t] as const));
  const out: InterceptorType[] = [];
  for (const row of rows) {
    const t = byId.get(row.typeId);
    if (!t) continue;
    const n = parseCount(row.count);
    for (let i = 0; i < n; i++) out.push(t);
  }
  return out;
}

export function AssetManagerDialog({ slug, data }: { slug: string; data: LayerFull }) {
  const qc = useQueryClient();
  const createInterceptor = useCreateInterceptor(slug);
  const createTeam = useCreateTeam(slug);
  const createThread = useCreateThread(slug);
  const deleteInterceptor = useDeleteInterceptor(slug);
  const deleteTeam = useDeleteTeam(slug);

  const assetStage = useUiStore((s) => s.assetStage);
  const setAssetStage = useUiStore((s) => s.setAssetStage);
  const assetCenter = useUiStore((s) => s.assetCenter);
  const setAssetCenter = useUiStore((s) => s.setAssetCenter);
  const assetRadiusKm = useUiStore((s) => s.assetRadiusKm);
  const setAssetRadiusKm = useUiStore((s) => s.setAssetRadiusKm);
  const setAssetPlan = useUiStore((s) => s.setAssetPlan);

  const types = data.types.interceptor;
  const typeById = useMemo(() => new Map(types.map((t) => [t._id, t] as const)), [types]);

  const [rows, setRows] = useState<AssetRow[]>([]);
  const [crewsStr, setCrewsStr] = useState('');
  const [radiusStr, setRadiusStr] = useState(String(assetRadiusKm));
  const [submitting, setSubmitting] = useState(false);

  const radiusInputRef = useRef<HTMLInputElement>(null);

  // Keep the radius mirror in sync when it changes from OUTSIDE (dragging the handle on the map),
  // unless the user is actively typing in the field.
  useEffect(() => {
    if (document.activeElement !== radiusInputRef.current) setRadiusStr(String(assetRadiusKm));
  }, [assetRadiusKm]);

  // On a fresh open (idle → setup), pre-fill the rows + crews from the sector's CURRENT assets,
  // so you start from what you have and adjust from there. Stage hops (place ↔ setup) keep edits.
  const prevStageRef = useRef(assetStage);
  useEffect(() => {
    const prev = prevStageRef.current;
    prevStageRef.current = assetStage;
    if (assetStage === 'setup' && prev === 'idle') {
      const counts = new Map<string, number>();
      for (const i of data.interceptors) counts.set(i.typeId, (counts.get(i.typeId) ?? 0) + 1);
      setRows(types.filter((t) => counts.has(t._id)).map((t) => ({ typeId: t._id, count: String(counts.get(t._id)!) })));
      setCrewsStr(data.teams.length > 0 ? String(data.teams.length) : '');
    }
  }, [assetStage, data.interceptors, data.teams, types]);

  const unusedTypes = useMemo(
    () => types.filter((t) => !rows.some((r) => r.typeId === t._id)),
    [types, rows],
  );

  const launchers = useMemo(() => expandLaunchers(types, rows), [types, rows]);
  const totalLaunchers = launchers.length;
  const parsedCrews = Number.parseInt(crewsStr, 10);
  const crews = Number.isFinite(parsedCrews) && parsedCrews >= 0 ? parsedCrews : 0;

  const parsedRadius = Number.parseFloat(radiusStr);
  const radiusValid = Number.isFinite(parsedRadius) && parsedRadius > 0;

  const setupValid = totalLaunchers >= 1 && totalLaunchers <= 100 && crews <= 100;

  // Keep the raw text so a count field can be cleared and retyped freely; parseCount reads it.
  function setRowCount(typeId: string, value: string) {
    setRows((prev) => prev.map((r) => (r.typeId === typeId ? { ...r, count: value } : r)));
  }
  function removeRow(typeId: string) {
    setRows((prev) => prev.filter((r) => r.typeId !== typeId));
  }
  function addRow(typeId: string) {
    setRows((prev) => (prev.some((r) => r.typeId === typeId) ? prev : [...prev, { typeId, count: '1' }]));
  }

  // Called by the AI panel when the operator hits Apply on a suggestion card.
  // The suggestion is a complete replacement loadout, not a diff.
  function applyAiSuggestion({ rows: nextRows, crews: nextCrews }: { rows: AssetRow[]; crews?: string }) {
    setRows(nextRows);
    if (nextCrews !== undefined) setCrewsStr(nextCrews);
  }

  function cancelAll() {
    setAssetStage('idle');
    setAssetPlan(null);
    setSubmitting(false);
  }

  function goToPlace() {
    if (!setupValid) return;
    setAssetPlan({
      ranges: launchers.map((t) => t.envelope.rangeKm),
      categories: launchers.map((t) => t.category),
    });
    if (!useUiStore.getState().assetCenter) setAssetCenter(getMapCenter(data));
    setAssetStage('place');
  }

  /** Smallest unused `${prefix}-<n>` given the codes already taken in this build. */
  function nextCode(taken: Set<string>, prefix: 'L' | 'MFG'): string {
    let n = 1;
    while (taken.has(`${prefix}-${n}`)) n += 1;
    const code = `${prefix}-${n}`;
    taken.add(code);
    return code;
  }

  async function onApply() {
    if (!setupValid || !assetCenter || !radiusValid || submitting) return;
    setSubmitting(true);
    try {
      // 1) wipe every existing launcher and crew in this sector (threads cascade)
      await Promise.all([
        ...data.interceptors.map((i) => deleteInterceptor.mutateAsync({ layerId: data.layer._id, id: i._id })),
        ...data.teams.map((t) => deleteTeam.mutateAsync({ layerId: data.layer._id, id: t._id })),
      ]);

      // 2) plan the full layout: MFG cluster at factory, non-MFG in G groups at bearings,
      //    central crew at factory threaded to every non-MFG (guarantees no NO-CREW flag),
      //    field crews one-per-group. Exclude any launcher position that lands inside a
      //    no-placement zone drawing — regardless of visibility (NPZ is a rule, not a display
      //    toggle) and regardless of shape (polygons pass through; circles + rectangles are
      //    converted to polygon rings so the planner's ray-cast still works).
      const npzDrawings = data.drawings.filter((d) => d.kind === 'noPlacementZone');
      const noPlacementZones = npzRingsKm(data.drawings, assetCenter);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[AssetManager] NPZ intake', {
          layerSlug: slug,
          totalDrawings: data.drawings.length,
          npzDrawings: npzDrawings.length,
          npzVisible: npzDrawings.filter((d) => d.visible).length,
          npzByGeom: {
            polygon: npzDrawings.filter((d) => d.geometry.type === 'polygon').length,
            circle: npzDrawings.filter((d) => d.geometry.type === 'circle').length,
            rectangle: npzDrawings.filter((d) => d.geometry.type === 'rectangle').length,
          },
          ringsToPlanner: noPlacementZones.length,
          assetCenter,
          radiusKm: parsedRadius,
        });
      }
      // 2) plan the layout in three independent passes:
      //    (a) MFGs cover the descent donut around the protected disk;
      //    (b) non-MFG launchers form analytic-ring layout for k-fold azimuth coverage;
      //    (c) crews: central at factory (primary-threads every non-MFG), field crews via
      //        k-means over launcher positions (override-thread their cluster).
      const mfgDescentLengthKm = currentDescentLengthKm(data.threats, data.types.threat);
      const mfgTypes = launchers.filter((t) => t.category === 'mfg');
      const nonMfgTypes = launchers.filter((t) => t.category !== 'mfg');
      const mfgPlan = planMfgPlacement(assetCenter, parsedRadius, mfgTypes, mfgDescentLengthKm, {
        noPlacementZones,
      });
      const launcherPlan = planLauncherPlacement(assetCenter, parsedRadius, nonMfgTypes, {
        noPlacementZones,
      });

      // Interleave results back into the original launcher order so downstream mutations line up.
      const allPositions: LatLng[] = new Array(launchers.length);
      let mfgCursor = 0;
      let nonMfgCursor = 0;
      const launcherKinds: LauncherKind[] = new Array(launchers.length);
      for (let i = 0; i < launchers.length; i++) {
        if (launchers[i]!.category === 'mfg') {
          allPositions[i] = mfgPlan.positions[mfgCursor++] ?? assetCenter;
          launcherKinds[i] = 'mfg';
        } else {
          allPositions[i] = launcherPlan.positions[nonMfgCursor++] ?? assetCenter;
          launcherKinds[i] = 'non-mfg';
        }
      }

      const crewPlan = planCrewPlacement(assetCenter, allPositions, launcherKinds, crews);

      if (import.meta.env.DEV) {
        // Warn (don't drop) if anything still lands in an NPZ. Perimeter-defense model:
        // launchers may sit far outside the coverage disk as long as their range extends
        // inward, so we DO NOT drop; we surface + create anyway.
        const stillInside = allPositions.filter((p) => isLatLngInAnyZone(assetCenter, p, noPlacementZones));
        const crewsStillInside = crewPlan.positions
          .slice(1) // crew #0 at factory is documented exempt
          .filter((p) => isLatLngInAnyZone(assetCenter, p, noPlacementZones));
        // eslint-disable-next-line no-console
        console.log('[AssetManager] post-plan NPZ check', {
          launchersStillInside: stillInside.length,
          fieldCrewsStillInside: crewsStillInside.length,
        });
      }

      // 3) create launchers at their planned positions
      const codes = new Set<string>();
      const created = await Promise.all(
        launchers.map((t, i) => {
          const ammo = t.loadout.hasReload
            ? { ready: t.loadout.defaultCapacity, reload: 0, capacity: t.loadout.defaultCapacity, reloadEtaSec: null }
            : null;
          const body: InterceptorCreate = {
            typeId: t._id,
            code: nextCode(codes, t.category === 'mfg' ? 'MFG' : 'L'),
            battlefieldCode: '',
            position: allPositions[i] ?? assetCenter,
            state: 'ready',
            ammo,
            constraints: null,
          };
          return createInterceptor.mutateAsync({ layerId: data.layer._id, body });
        }),
      );

      // 4) create crews at their planned positions (crew #0 at center, field crews at cluster centroids)
      const createdCrews = await Promise.all(
        crewPlan.positions.map((pos, j) => {
          const body: TeamCreate = {
            // `C<n>` crew scheme — must never collide with threat codes (`T-<n>`). Safe to
            // number from 1: apply wipes every existing crew in the sector first.
            code: `C${j + 1}`,
            battlefieldCode: '',
            position: pos,
            role: j === 0 ? 'central control' : 'local crew',
            isElite: false,
          };
          return createTeam.mutateAsync({ layerId: data.layer._id, body });
        }),
      );

      // 5) wire crew↔launcher threads: central crew primary-threads every non-MFG (never NO-CREW),
      //    field crews override-thread their cluster (closer alternate operator).
      await Promise.all(
        crewPlan.threads.map((th) =>
          createThread.mutateAsync({
            layerId: data.layer._id,
            teamId: createdCrews[th.crewIdx]!._id,
            interceptorId: created[th.launcherIdx]!._id,
            kind: th.kind,
          }),
        ),
      );

      await qc.invalidateQueries({ queryKey: ['layer-full', slug] });
      cancelAll();
    } catch {
      // surfaced by mutation onError handlers
    } finally {
      setSubmitting(false);
    }
  }

  // STAGE 1: setup — pick weapon types/counts + crews
  if (assetStage === 'setup') {
    const noTypes = types.length === 0;
    return (
      <Dialog
        open
        onOpenChange={(v) => { if (!v) cancelAll(); }}
        title="Manage assets · step 1"
        subtitle="Choose the launchers and crews you have, then place the area to cover."
        width={960}
      >
        <div className="flex" style={{ minHeight: 480, maxHeight: 'calc(90vh - 56px)' }}>
        <div className="p-5 space-y-4 overflow-y-auto" style={{ width: 500 }}>
          <FormField
            label={`Launchers · ${totalLaunchers} total`}
          >
            <div className="border border-line divide-y divide-line">
              {noTypes && <div className="px-2 py-3 text-muted text-[11px] font-mono">— no types —</div>}
              {!noTypes && rows.length === 0 && (
                <div className="px-2 py-3 text-muted text-[11px] font-mono">— no assets · add a type below —</div>
              )}
              {rows.map((row) => {
                const t = typeById.get(row.typeId);
                if (!t) return null;
                return (
                  <div key={row.typeId} className="flex items-center gap-2 px-2 py-1.5 font-mono text-xs">
                    <span className="font-bold text-ink">{t.displayName}</span>
                    <span className="text-muted truncate">· {t.category} · {t.envelope.rangeKm} km</span>
                    <input
                      className={`${inputCls} ml-auto w-16`}
                      type="number"
                      min={0}
                      max={100}
                      placeholder="0"
                      value={row.count}
                      onChange={(e) => setRowCount(row.typeId, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.typeId)}
                      title="Remove asset type"
                      aria-label={`Remove ${t.displayName}`}
                      className="text-muted hover:text-red border border-line hover:border-red w-6 h-6 flex items-center justify-center shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            {unusedTypes.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Plus size={12} className="text-muted shrink-0" />
                <select
                  className={inputCls}
                  value=""
                  onChange={(e) => { if (e.target.value) addRow(e.target.value); }}
                >
                  <option value="">Add asset type…</option>
                  {unusedTypes.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.displayName} · {t.category} · {t.envelope.rangeKm} km
                    </option>
                  ))}
                </select>
              </div>
            )}
          </FormField>

          <FormField
            label="Crews"
          >
            <input
              className={inputCls}
              type="number"
              min={0}
              max={100}
              placeholder="0"
              value={crewsStr}
              onChange={(e) => setCrewsStr(e.target.value)}
            />
          </FormField>

          <div className="text-[10px] font-mono text-amber leading-snug">
            Applying replaces every existing launcher and crew in this sector.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" className={buttonGhost} onClick={cancelAll}>
              Cancel
            </button>
            <button type="button" className={buttonPrimary} disabled={!setupValid} onClick={goToPlace}>
              Next: place area →
            </button>
          </div>
        </div>
        <div className="border-l border-line" style={{ width: 460 }}>
          <AssetChatPanel
            types={types}
            rows={rows}
            crewsStr={crewsStr}
            onApplySuggestion={applyAiSuggestion}
          />
        </div>
        </div>
      </Dialog>
    );
  }

  // STAGE 2: place — corner panel; user drags the coverage region and sees the optimized layout live
  if (assetStage === 'place') {
    const smallInputCls =
      'bg-bg border border-line text-ink font-mono text-[10px] px-1.5 py-0.5 rounded-sm focus:outline-none focus:border-cyan w-full';
    const smallBtn = 'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border';
    return (
      <MapCornerPanel style={{ width: 256 }}>
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-line">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Step 2</div>
            <div className="font-mono text-[11px] font-bold text-ink">Place area · optimize coverage</div>
          </div>
          <button
            type="button"
            onClick={cancelAll}
            className="text-muted hover:text-ink font-mono text-[10px] uppercase tracking-wider"
          >
            ✕
          </button>
        </div>

        <div className="p-2 space-y-2">
          <div className="text-[9px] text-muted font-mono leading-snug">
            Drag the crosshair to your factory, then the cyan square to set the radius you want to cover.
          </div>

          <div className="text-[10px] font-mono">
            <span className="text-muted uppercase tracking-wider">Center </span>
            <span className="text-ink">
              {assetCenter ? `${assetCenter.lat.toFixed(4)}, ${assetCenter.lng.toFixed(4)}` : '— click the map —'}
            </span>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="text-muted text-[9px] uppercase tracking-wider">Coverage radius km</span>
            <input
              ref={radiusInputRef}
              className={smallInputCls}
              type="number"
              min={0}
              step={0.1}
              value={radiusStr}
              onChange={(e) => {
                const s = e.target.value;
                setRadiusStr(s);
                const n = Number.parseFloat(s);
                if (Number.isFinite(n) && n > 0) setAssetRadiusKm(n);
              }}
            />
          </label>

          <div className="text-[10px] font-mono text-muted">
            <span className="text-cyan">{totalLaunchers}</span> launchers ·{' '}
            <span className="text-cyan">{crews}</span> crews
          </div>

          <div className="flex items-center justify-between gap-1.5 pt-1">
            <button
              type="button"
              className={`${smallBtn} border-line text-muted hover:text-ink hover:border-ink`}
              onClick={() => setAssetStage('setup')}
              disabled={submitting}
            >
              ← Back
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`${smallBtn} border-line text-muted hover:text-ink hover:border-ink`}
                onClick={cancelAll}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${smallBtn} bg-cyan/10 border-cyan text-cyan hover:bg-cyan/20 disabled:opacity-40`}
                disabled={!assetCenter || !radiusValid || submitting}
                onClick={onApply}
              >
                {submitting ? 'Placing…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      </MapCornerPanel>
    );
  }

  return null;
}
