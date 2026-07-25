import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { ThreatCreate } from '@shared/schemas/threat';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost } from '../shared/Dialog';
import { useUiStore } from '../../stores/uiStore';
import { LAUNCH_PRESETS } from '@algos/threat-placement/threat-sim-presets';
import { randomContactInSector } from '@algos/threat-placement/threat-sim';
import { haversineKm } from '@shared/distance';
import { api } from '../../api/client';
import { useCreateThreat, useDeleteThreat } from '../../queries/useMutations';
import { MapCornerPanel } from '../shared/MapCornerPanel';

function getMapCenter(data: LayerFull): LatLng {
  const view = useUiStore.getState().mapViewByLayer[data.layer._id];
  return view ? view.center : data.layer.mapCenter;
}

export function ThreatSimulatorDialog({
  slug,
  data,
}: {
  slug: string;
  data: LayerFull;
}) {
  const qc = useQueryClient();
  const createThreat = useCreateThreat(slug);
  const deleteThreat = useDeleteThreat(slug);

  const simStage = useUiStore((s) => s.simStage);
  const setSimStage = useUiStore((s) => s.setSimStage);
  const simTarget = useUiStore((s) => s.simTarget);
  const setSimTarget = useUiStore((s) => s.setSimTarget);
  const simSector = useUiStore((s) => s.simSector);
  const setSimSector = useUiStore((s) => s.setSimSector);
  const simSource = useUiStore((s) => s.simSource);
  const isApi = simSource === 'api';

  // String mirrors so the user can clear and retype freely.
  const [countStr, setCountStr] = useState('5');
  const [radiusStr, setRadiusStr] = useState(String(simSector.radiusKm));
  const [angleFromStr, setAngleFromStr] = useState(String(simSector.angleFromDeg));
  const [angleToStr, setAngleToStr] = useState(String(simSector.angleToDeg));
  const [etaMinStr, setEtaMinStr] = useState(String(simSector.etaMinutes));
  const [etaVarStr, setEtaVarStr] = useState(String(simSector.etaVarianceSec));
  const [selectedOrigins, setSelectedOrigins] = useState<Set<string>>(
    () => new Set(LAUNCH_PRESETS.map((p) => p.code)),
  );
  const [submitting, setSubmitting] = useState(false);

  const radiusInputRef = useRef<HTMLInputElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const etaMinInputRef = useRef<HTMLInputElement>(null);
  const etaVarInputRef = useRef<HTMLInputElement>(null);

  // Sync mirrors when sim* state changes from OUTSIDE (e.g., dragging the radius handle on the map)
  // but only when the user isn't actively typing in that input.
  useEffect(() => {
    if (document.activeElement !== radiusInputRef.current) {
      setRadiusStr(String(simSector.radiusKm));
    }
  }, [simSector.radiusKm]);
  useEffect(() => {
    if (document.activeElement !== fromInputRef.current) {
      setAngleFromStr(String(simSector.angleFromDeg));
    }
  }, [simSector.angleFromDeg]);
  useEffect(() => {
    if (document.activeElement !== toInputRef.current) {
      setAngleToStr(String(simSector.angleToDeg));
    }
  }, [simSector.angleToDeg]);
  useEffect(() => {
    if (document.activeElement !== etaMinInputRef.current) {
      setEtaMinStr(String(simSector.etaMinutes));
    }
  }, [simSector.etaMinutes]);
  useEffect(() => {
    if (document.activeElement !== etaVarInputRef.current) {
      setEtaVarStr(String(simSector.etaVarianceSec));
    }
  }, [simSector.etaVarianceSec]);

  const parsedCount = Number.parseInt(countStr, 10);
  const parsedRadius = Number.parseFloat(radiusStr);
  const parsedFrom = Number.parseFloat(angleFromStr);
  const parsedTo = Number.parseFloat(angleToStr);
  const parsedEtaMin = Number.parseFloat(etaMinStr);
  const parsedEtaVar = Number.parseFloat(etaVarStr);
  const countValid = Number.isFinite(parsedCount) && parsedCount >= 1 && parsedCount <= 50;
  const radiusValid = Number.isFinite(parsedRadius) && parsedRadius > 0;
  // API source is a full-circle scatter — the sector's angles aren't sent upstream, so
  // treat them as always valid in that mode.
  const anglesValid = isApi || (Number.isFinite(parsedFrom) && Number.isFinite(parsedTo));
  const etaValid = Number.isFinite(parsedEtaMin) && parsedEtaMin > 0 && Number.isFinite(parsedEtaVar) && parsedEtaVar >= 0;

  const shahedType = useMemo(
    () => data.types.threat.find((t) => t.key === 'shahed-136'),
    [data.types.threat],
  );

  // When transitioning into 'place' and there's no target yet, seed one from the map center.
  useEffect(() => {
    if (simStage === 'place' && !useUiStore.getState().simTarget) {
      setSimTarget(getMapCenter(data));
    }
  }, [simStage, data, setSimTarget]);

  const presetsEmpty = LAUNCH_PRESETS.length === 0;
  const setupValid = !presetsEmpty && selectedOrigins.size > 0 && countValid;
  const canGenerate =
    setupValid &&
    !!simTarget &&
    radiusValid &&
    anglesValid &&
    etaValid &&
    !!shahedType &&
    !submitting;

  function toggleOrigin(code: string) {
    setSelectedOrigins((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function cancelAll() {
    setSimStage('idle');
    setSubmitting(false);
  }

  async function onGenerate() {
    if (!canGenerate || !shahedType || !simTarget) return;
    const origins = LAUNCH_PRESETS.filter((p) => selectedOrigins.has(p.code));
    if (origins.length === 0) return;
    const count = parsedCount;

    setSubmitting(true);
    try {
      const detonationRadiusM = 180;
      // Shrink sampling radius so the entire detonation circle stays inside the designation sector.
      const sampleRadiusKm = Math.max(0, simSector.radiusKm - detonationRadiusM / 1000);

      // Source the N contact points either from the API (real detection scatter around
      // simTarget, angle ignored — the API only does full circles) or from the local
      // random-in-sector sampler.
      let contacts: LatLng[];
      if (isApi) {
        const resp = await api.getExternalDetections(
          simTarget.lat,
          simTarget.lng,
          count,
          sampleRadiusKm * 1000,
        );
        contacts = resp.detections.map((d) => ({
          lat: d.position.latitude,
          lng: d.position.longitude,
        }));
        if (contacts.length === 0) return;
      } else {
        contacts = Array.from({ length: count }, () =>
          randomContactInSector(
            simTarget,
            sampleRadiusKm,
            simSector.angleFromDeg,
            simSector.angleToDeg,
          ),
        );
      }

      // Wipe existing threats only AFTER the (possibly network-bound) contact fetch,
      // so a failed API call leaves the current state untouched.
      await Promise.all(
        data.threats.map((t) =>
          deleteThreat.mutateAsync({ layerId: data.layer._id, id: t._id }),
        ),
      );

      const bodies: ThreatCreate[] = contacts.map((contact, i) => {
        const origin = origins[Math.floor(Math.random() * origins.length)]!;
        // Place the threat's *current* position N minutes from the contact along the
        // origin→contact bearing. N = etaMinutes ± uniform(etaVarianceSec).
        const totalKm = haversineKm(origin, contact);
        const speedKmh = shahedType.typicalSpeedKmh;
        const meanSec = simSector.etaMinutes * 60;
        const jitterSec = (Math.random() * 2 - 1) * simSector.etaVarianceSec;
        const etaSec = Math.max(0, meanSec + jitterSec);
        const distFromContactKm = Math.min(totalKm, (etaSec / 3600) * speedKmh);
        const tBack = totalKm > 0 ? distFromContactKm / totalKm : 0;
        const currentPos: LatLng = {
          lat: contact.lat + (origin.lat - contact.lat) * tBack,
          lng: contact.lng + (origin.lng - contact.lng) * tBack,
        };

        // attack leg = the drone's terminal descent phase before detonation (or the whole
        // remaining trip if shorter). Default 500 m, inherited from the threat type.
        const descentPhaseM = (shahedType as any).descentPhaseM ?? 500;
        const descentPhaseKm = descentPhaseM / 1000;
        const hasCruise = distFromContactKm > descentPhaseKm;
        const attackLegKm = Math.min(descentPhaseKm, distFromContactKm);
        const attackStartT = distFromContactKm > 0 ? attackLegKm / distFromContactKm : 0;
        const attackStart: LatLng = {
          lat: contact.lat + (currentPos.lat - contact.lat) * attackStartT,
          lng: contact.lng + (currentPos.lng - contact.lng) * attackStartT,
        };

        return {
          typeId: shahedType._id,
          code: `T-${i + 1}`,
          position: currentPos,
          altitudeM: shahedType.typicalAltitudeM.max,
          speedKmh,
          descentPhaseM,
          geometry: {
            pastPath: [{ lat: origin.lat, lng: origin.lng }, currentPos],
            futureCruise: hasCruise ? [currentPos, attackStart] : null,
            futureAttack: hasCruise ? [attackStart, contact] : [currentPos, contact],
            detonation: { lat: contact.lat, lng: contact.lng, radiusM: detonationRadiusM },
            divergence: null,
          },
        };
      });

      await Promise.all(
        bodies.map((body) =>
          createThreat.mutateAsync({ layerId: data.layer._id, body }),
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

  // STAGE 1: setup — centered Radix Dialog with overlay
  if (simStage === 'setup') {
    return (
      <Dialog
        open
        onOpenChange={(v) => { if (!v) cancelAll(); }}
        title={isApi ? 'Simulate threats (real detections) · step 1' : 'Simulate threats · step 1'}
        subtitle={
          isApi
            ? 'Positions come from the Fusion detections API around the target (full circle, sector angles ignored). Pick count + launch sites, then place the target.'
            : 'Set the count and pick launch sites, then place the target on the map.'
        }
        width={520}
      >
        <div className="p-5 space-y-4">
          <FormField
            label="Number of threats"
            hint={!countValid && countStr !== '' ? 'Must be between 1 and 50.' : undefined}
          >
            <input
              className={inputCls}
              type="number"
              min={1}
              max={50}
              value={countStr}
              onChange={(e) => setCountStr(e.target.value)}
            />
          </FormField>

          <FormField
            label={`Launch positions · ${selectedOrigins.size}/${LAUNCH_PRESETS.length}`}
            hint={
              presetsEmpty
                ? 'No launch positions configured yet — paste them into algos/threat-placement/threat-sim-presets.ts.'
                : undefined
            }
          >
            {!presetsEmpty && (
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  className={buttonGhost}
                  onClick={() => setSelectedOrigins(new Set(LAUNCH_PRESETS.map((p) => p.code)))}
                >
                  All
                </button>
                <button
                  type="button"
                  className={buttonGhost}
                  onClick={() => setSelectedOrigins(new Set())}
                >
                  None
                </button>
              </div>
            )}
            <div className="border border-line max-h-40 overflow-y-auto">
              {presetsEmpty && (
                <div className="px-2 py-3 text-muted text-[11px] font-mono">— empty —</div>
              )}
              {LAUNCH_PRESETS.map((p) => {
                const checked = selectedOrigins.has(p.code);
                return (
                  <label
                    key={p.code}
                    className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-bg/60 font-mono text-xs ${
                      checked ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleOrigin(p.code)} />
                    <span className="font-bold">{p.code}</span>
                    <span className="text-muted ml-auto">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </span>
                  </label>
                );
              })}
            </div>
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" className={buttonGhost} onClick={cancelAll}>
              Cancel
            </button>
            <button
              type="button"
              className={buttonPrimary}
              disabled={!setupValid}
              onClick={() => setSimStage('place')}
            >
              Next: place target →
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  // STAGE 2: place — corner panel, non-modal, lets the user click + drag on the map
  if (simStage === 'place') {
    // smaller input variant for the corner panel — half the vertical padding of inputCls
    const smallInputCls =
      'bg-bg border border-line text-ink font-mono text-[10px] px-1.5 py-0.5 rounded-sm focus:outline-none focus:border-cyan w-full';
    const smallBtn = 'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border';
    return (
      <MapCornerPanel style={{ width: 256 }}>
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-line">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Step 2 {isApi && '· real detections'}
            </div>
            <div className="font-mono text-[11px] font-bold text-ink">Place target · adjust sector</div>
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
            Drag the crosshair (center), the cyan square (radius), or the yellow/amber dots (angles).
          </div>

          <div className="text-[10px] font-mono">
            <span className="text-muted uppercase tracking-wider">Target </span>
            <span className="text-ink">
              {simTarget
                ? `${simTarget.lat.toFixed(4)}, ${simTarget.lng.toFixed(4)}`
                : '— click the map —'}
            </span>
          </div>

          <div className={isApi ? '' : 'grid grid-cols-3 gap-1.5'}>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted text-[9px] uppercase tracking-wider">Radius km</span>
              <input
                ref={radiusInputRef}
                className={smallInputCls}
                type="number"
                min={0}
                step={0.5}
                value={radiusStr}
                onChange={(e) => {
                  const s = e.target.value;
                  setRadiusStr(s);
                  const n = Number.parseFloat(s);
                  if (Number.isFinite(n) && n > 0) setSimSector({ ...simSector, radiusKm: n });
                }}
              />
            </label>
            {!isApi && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wider">From °</span>
                  <input
                    ref={fromInputRef}
                    className={smallInputCls}
                    type="number"
                    step={5}
                    value={angleFromStr}
                    onChange={(e) => {
                      const s = e.target.value;
                      setAngleFromStr(s);
                      const n = Number.parseFloat(s);
                      if (Number.isFinite(n)) setSimSector({ ...simSector, angleFromDeg: n });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wider">To °</span>
                  <input
                    ref={toInputRef}
                    className={smallInputCls}
                    type="number"
                    step={5}
                    value={angleToStr}
                    onChange={(e) => {
                      const s = e.target.value;
                      setAngleToStr(s);
                      const n = Number.parseFloat(s);
                      if (Number.isFinite(n)) setSimSector({ ...simSector, angleToDeg: n });
                    }}
                  />
                </label>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted text-[9px] uppercase tracking-wider">ETA min</span>
              <input
                ref={etaMinInputRef}
                className={smallInputCls}
                type="number"
                min={0}
                step={0.5}
                value={etaMinStr}
                onChange={(e) => {
                  const s = e.target.value;
                  setEtaMinStr(s);
                  const n = Number.parseFloat(s);
                  if (Number.isFinite(n) && n > 0) setSimSector({ ...simSector, etaMinutes: n });
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted text-[9px] uppercase tracking-wider">± sec</span>
              <input
                ref={etaVarInputRef}
                className={smallInputCls}
                type="number"
                min={0}
                step={5}
                value={etaVarStr}
                onChange={(e) => {
                  const s = e.target.value;
                  setEtaVarStr(s);
                  const n = Number.parseFloat(s);
                  if (Number.isFinite(n) && n >= 0) setSimSector({ ...simSector, etaVarianceSec: n });
                }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-1.5 pt-1">
            <button
              type="button"
              className={`${smallBtn} border-line text-muted hover:text-ink hover:border-ink`}
              onClick={() => setSimStage('setup')}
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
                disabled={!canGenerate}
                onClick={onGenerate}
              >
                {submitting ? 'Gen…' : countValid ? `Generate ${parsedCount}` : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      </MapCornerPanel>
    );
  }

  return null;
}
