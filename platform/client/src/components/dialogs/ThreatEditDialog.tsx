import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Threat } from '@shared/schemas/threat';
import type { ThreatType } from '@shared/schemas/threat-type';
import { useUpdateThreat, useDeleteThreat } from '../../queries/useMutations';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost, buttonDanger } from '../shared/Dialog';
import { useUiStore } from '../../stores/uiStore';

type InstanceForm = {
  code: string;
  positionLat: number;
  positionLng: number;
  altitudeM: number;
  speedKmh: number;
  detLat: number;
  detLng: number;
  radiusM: number;
  divWidthM: number;
  divHeightM: number;
};

export function ThreatEditDialog({
  open,
  onOpenChange,
  slug,
  threat,
  type,
  allTypes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  threat: Threat;
  type: ThreatType;
  allTypes: ThreatType[];
}) {
  const update = useUpdateThreat(slug);
  const del = useDeleteThreat(slug);
  const setSelection = useUiStore((s) => s.setSelection);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typeId, setTypeId] = useState(threat.typeId);
  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setTypeId(threat.typeId);
    }
  }, [open, threat.typeId]);

  const det = threat.geometry.detonation;
  const div = threat.geometry.divergence;

  const defaults: InstanceForm = useMemo(
    () => ({
      code: threat.code,
      positionLat: threat.position.lat,
      positionLng: threat.position.lng,
      altitudeM: threat.altitudeM,
      speedKmh: threat.speedKmh,
      detLat: det?.lat ?? threat.position.lat,
      detLng: det?.lng ?? threat.position.lng,
      radiusM: det?.radiusM ?? 180,
      divWidthM: div?.widthM ?? 3000,
      divHeightM: div?.heightM ?? 1500,
    }),
    [threat, det, div],
  );
  const form = useForm<InstanceForm>({ defaultValues: defaults, values: defaults });

  const onSubmit = form.handleSubmit(async (v) => {
    const geometry = {
      ...threat.geometry,
      detonation: { lat: Number(v.detLat), lng: Number(v.detLng), radiusM: Number(v.radiusM) },
      divergence: {
        widthM: Number(v.divWidthM),
        heightM: Number(v.divHeightM),
      },
    };
    await update.mutateAsync({
      layerId: threat.layerId,
      id: threat._id,
      version: threat.version,
      patch: {
        code: v.code,
        typeId,
        position: { lat: Number(v.positionLat), lng: Number(v.positionLng) },
        altitudeM: Number(v.altitudeM),
        speedKmh: Number(v.speedKmh),
        geometry,
      },
    });
    onOpenChange(false);
  });

  const selectedType = allTypes.find((t) => t._id === typeId) ?? type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${threat.code}`} subtitle={selectedType.displayName} width={760}>
      <div className="grid grid-cols-2 divide-x divide-line">
        <form className="p-5 space-y-3" onSubmit={onSubmit}>
          <div className="text-cyan text-[10px] uppercase tracking-wider font-bold">Instance · this threat only</div>
          <FormField label="Code">
            <input className={inputCls} {...form.register('code', { required: true })} />
          </FormField>
          <FormField label="Position — current (lat / lng)">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="number" step="0.000001" {...form.register('positionLat', { valueAsNumber: true })} />
              <input className={inputCls} type="number" step="0.000001" {...form.register('positionLng', { valueAsNumber: true })} />
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Altitude (m)">
              <input className={inputCls} type="number" {...form.register('altitudeM', { valueAsNumber: true })} />
            </FormField>
            <FormField label="Speed (km/h)">
              <input className={inputCls} type="number" {...form.register('speedKmh', { valueAsNumber: true })} />
            </FormField>
          </div>
          <FormField label="Target — detonation point (lat / lng)">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="number" step="0.000001" {...form.register('detLat', { valueAsNumber: true })} />
              <input className={inputCls} type="number" step="0.000001" {...form.register('detLng', { valueAsNumber: true })} />
            </div>
          </FormField>
          <FormField label="Detonation radius (m)">
            <input className={inputCls} type="number" {...form.register('radiusM', { valueAsNumber: true })} />
          </FormField>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              className={buttonDanger}
              disabled={del.isPending}
              onClick={async () => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                try {
                  await del.mutateAsync({ layerId: threat.layerId, id: threat._id });
                  setSelection(null);
                  onOpenChange(false);
                } catch { /* mutation onError surfaces */ }
              }}
            >
              {del.isPending ? 'Deleting…' : confirmDelete ? 'Click again to confirm' : 'Delete threat'}
            </button>
            <div className="ml-auto flex gap-2">
              <button type="button" className={buttonGhost} onClick={() => onOpenChange(false)}>Cancel</button>
              <button type="submit" className={buttonPrimary} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </form>

        <div className="p-5 space-y-3">
          <div className="text-amber text-[10px] uppercase tracking-wider font-bold">Type &amp; divergence</div>
          <FormField label="Threat type" hint="Edit type specs in Settings">
            <select className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {allTypes.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.displayName} · {t.family}
                </option>
              ))}
            </select>
          </FormField>
          <div className="border border-line p-2 font-mono text-[11px] text-muted space-y-0.5">
            <div>Speed · {selectedType.typicalSpeedKmh} km/h</div>
            <div>Altitude · {selectedType.typicalAltitudeM.min}–{selectedType.typicalAltitudeM.max} m</div>
            <div>Warhead · {selectedType.warheadKg != null ? `${selectedType.warheadKg} kg` : 'unknown'}</div>
            <div>Descent phase · {(selectedType as any).descentPhaseM ?? 500} m</div>
          </div>
          <FormField label="Divergence zone — width / height (m)" hint="Centered on the detonation point. Cosmetic only.">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="number" {...form.register('divWidthM', { valueAsNumber: true })} />
              <input className={inputCls} type="number" {...form.register('divHeightM', { valueAsNumber: true })} />
            </div>
          </FormField>
          <div className="text-muted text-[10px] pt-1">
            Divergence edits save with the instance form on the left.
          </div>
        </div>
      </div>
    </Dialog>
  );
}
