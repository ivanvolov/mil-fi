import { useEffect, useMemo, useState } from 'react';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { InterceptorCreate } from '@shared/schemas/interceptor';
import { useCreateInterceptor, useCreateThread } from '../../queries/useMutations';
import { useUiStore } from '../../stores/uiStore';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost } from '../shared/Dialog';

/** MFG types → `MFG-<n>`, everything else → `L-<n>`. Numbering scans existing codes that
 *  match the chosen prefix and picks the smallest unused integer ≥ 1. */
function nextLauncherCode(existingCodes: string[], prefix: 'L' | 'MFG'): string {
  const used = new Set<number>();
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const code of existingCodes) {
    const m = re.exec(code);
    if (m && m[1]) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}-${n}`;
}

function getMapCenter(data: LayerFull): LatLng {
  const view = useUiStore.getState().mapViewByLayer[data.layer._id];
  return view ? view.center : data.layer.mapCenter;
}

export function LauncherCreateDialog({
  open,
  onOpenChange,
  slug,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  data: LayerFull;
}) {
  const createInterceptor = useCreateInterceptor(slug);
  const createThread = useCreateThread(slug);
  const setSelection = useUiStore((s) => s.setSelection);
  const setBulkOrchestrate = useUiStore((s) => s.setBulkOrchestrate);

  const types = data.types.interceptor;
  const teams = data.teams;

  const [typeId, setTypeId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');

  useEffect(() => {
    if (open) {
      setTypeId(types[0]?._id ?? '');
      setTeamId('');
    }
  }, [open, types]);

  const selectedType = useMemo(() => types.find((t) => t._id === typeId), [types, typeId]);

  const submitting = createInterceptor.isPending || createThread.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType) return;
    const center = getMapCenter(data);
    const ammo = selectedType.loadout.hasReload
      ? {
          ready: selectedType.loadout.defaultCapacity,
          reload: 0,
          capacity: selectedType.loadout.defaultCapacity,
          reloadEtaSec: null,
        }
      : null;
    const prefix = selectedType.category === 'mfg' ? 'MFG' : 'L';
    const body: InterceptorCreate = {
      typeId: selectedType._id,
      code: nextLauncherCode(data.interceptors.map((i) => i.code), prefix),
      battlefieldCode: '',
      position: center,
      state: 'ready',
      ammo,
      constraints: null,
    };
    try {
      const created = await createInterceptor.mutateAsync({ layerId: data.layer._id, body });
      if (teamId) {
        const team = teams.find((t) => t._id === teamId);
        if (team) {
          try {
            await createThread.mutateAsync({
              layerId: data.layer._id,
              teamId: team._id,
              interceptorId: created._id,
              kind: team.isElite ? 'override' : 'primary',
            });
          } catch {
            /* surfaced by mutation onError */
          }
        }
      }
      // Exit orchestration view so the new launcher's inspector is visible.
      setBulkOrchestrate(false);
      setSelection({ kind: 'interceptor', id: created._id }, { zoom: true });
      onOpenChange(false);
    } catch {
      /* surfaced by mutation onError */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add launcher"
      subtitle="Pick a type and (optionally) the crew that will control it"
      width={460}
    >
      <form className="p-5 space-y-3" onSubmit={onSubmit}>
        <FormField label="Type" hint="Edit type specs in Settings">
          <select
            className={inputCls}
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={types.length === 0}
          >
            {types.length === 0 && <option value="">no interceptor types defined</option>}
            {types.map((t) => (
              <option key={t._id} value={t._id}>
                {t.displayName} · {t.category} · range {t.envelope.rangeKm} km
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Crew (group)" hint="Optional — assign a controlling crew. You can change this later.">
          <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— unassigned —</option>
            {teams.map((t) => (
              <option key={t._id} value={t._id}>
                {t.code} — {t.role}
                {t.isElite ? ' (elite)' : ''}
              </option>
            ))}
          </select>
        </FormField>

        <div className="text-muted text-[10px] font-mono">
          New launcher will be placed at the current map center — drag the marker on the map to move it.
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className={buttonGhost} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimary} disabled={!selectedType || submitting}>
            {submitting ? 'Creating…' : 'Create launcher'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
