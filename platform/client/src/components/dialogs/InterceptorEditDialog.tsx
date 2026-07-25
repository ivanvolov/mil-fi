import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { Team } from '@shared/schemas/team';
import type { Thread } from '@shared/schemas/thread';
import {
  useUpdateInterceptor,
  useDeleteInterceptor,
  useCreateThread,
  useDeleteThread,
} from '../../queries/useMutations';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost, buttonDanger } from '../shared/Dialog';
import { useUiStore } from '../../stores/uiStore';

type InstanceForm = {
  typeId: string;
  code: string;
  state: 'ready' | 'reload' | 'offline';
  positionLat: number;
  positionLng: number;
  ammoReady: number;
  ammoReload: number;
  ammoCapacity: number;
  ammoReloadEta: string;
};

export function InterceptorEditDialog({
  open,
  onOpenChange,
  slug,
  interceptor,
  type,
  allTypes,
  teams,
  threads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  interceptor: Interceptor;
  type: InterceptorType;
  allTypes: InterceptorType[];
  teams: Team[];
  threads: Thread[];
}) {
  const updateInstance = useUpdateInterceptor(slug);
  const deleteInstance = useDeleteInterceptor(slug);
  const createThread = useCreateThread(slug);
  const deleteThread = useDeleteThread(slug);
  const setSelection = useUiStore((s) => s.setSelection);

  const assigned = useMemo(
    () => threads.filter((t) => t.interceptorId === interceptor._id),
    [threads, interceptor._id],
  );
  const assignedTeamIds = useMemo(() => new Set(assigned.map((t) => t.teamId)), [assigned]);
  const availableTeams = useMemo(
    () => teams.filter((t) => !assignedTeamIds.has(t._id)),
    [teams, assignedTeamIds],
  );
  const [addTeamId, setAddTeamId] = useState<string>('');
  useEffect(() => { setAddTeamId(''); }, [interceptor._id, assigned.length]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (open) setConfirmDelete(false); }, [open]);

  const instanceDefaults: InstanceForm = useMemo(
    () => ({
      typeId: interceptor.typeId,
      code: interceptor.code,
      state: interceptor.state,
      positionLat: interceptor.position.lat,
      positionLng: interceptor.position.lng,
      ammoReady: interceptor.ammo?.ready ?? 0,
      ammoReload: interceptor.ammo?.reload ?? 0,
      ammoCapacity: interceptor.ammo?.capacity ?? type.loadout.defaultCapacity,
      ammoReloadEta: interceptor.ammo?.reloadEtaSec != null ? String(interceptor.ammo.reloadEtaSec) : '',
    }),
    [interceptor, type],
  );
  const instanceForm = useForm<InstanceForm>({ defaultValues: instanceDefaults, values: instanceDefaults });

  const submitInstance = instanceForm.handleSubmit(async (v) => {
    const newType = allTypes.find((t) => t._id === v.typeId) ?? type;
    await updateInstance.mutateAsync({
      layerId: interceptor.layerId,
      id: interceptor._id,
      version: interceptor.version,
      patch: {
        typeId: v.typeId,
        code: v.code,
        state: v.state,
        position: { lat: Number(v.positionLat), lng: Number(v.positionLng) },
        ammo: newType.loadout.hasReload
          ? {
              ready: Number(v.ammoReady),
              reload: Number(v.ammoReload),
              capacity: Number(v.ammoCapacity),
              reloadEtaSec: v.ammoReloadEta === '' ? null : Number(v.ammoReloadEta),
            }
          : null,
      },
    });
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${interceptor.code}`}
      subtitle={type.displayName}
      width={460}
    >
      <form className="p-5 space-y-3" onSubmit={submitInstance}>
        <FormField label="Type" hint="Edit type specs in Settings">
          <select className={inputCls} {...instanceForm.register('typeId')}>
            {allTypes.map((t) => (
              <option key={t._id} value={t._id}>
                {t.displayName} · {t.category} · range {t.envelope.rangeKm} km
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Code">
          <input className={inputCls} {...instanceForm.register('code', { required: true })} />
        </FormField>
        <FormField label="State">
          <select className={inputCls} {...instanceForm.register('state')}>
            <option value="ready">ready</option>
            <option value="reload">reload</option>
            <option value="offline">offline</option>
          </select>
        </FormField>
        <FormField label="Position (lat / lng)" hint="or drag the marker on the map in edit mode">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} type="number" step="0.000001" {...instanceForm.register('positionLat', { valueAsNumber: true })} />
            <input className={inputCls} type="number" step="0.000001" {...instanceForm.register('positionLng', { valueAsNumber: true })} />
          </div>
        </FormField>
        {type.loadout.hasReload && (
          <>
            <div className="text-muted text-[10px] uppercase tracking-wider pt-1">Ammo</div>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Ready">
                <input className={inputCls} type="number" min="0" {...instanceForm.register('ammoReady', { valueAsNumber: true })} />
              </FormField>
              <FormField label="Reload">
                <input className={inputCls} type="number" min="0" {...instanceForm.register('ammoReload', { valueAsNumber: true })} />
              </FormField>
              <FormField label="Capacity">
                <input className={inputCls} type="number" min="0" {...instanceForm.register('ammoCapacity', { valueAsNumber: true })} />
              </FormField>
            </div>
            <FormField label="Reload ETA (sec)" hint="blank = unknown / not reloading">
              <input className={inputCls} type="number" min="0" {...instanceForm.register('ammoReloadEta')} />
            </FormField>
          </>
        )}

        <div className="text-muted text-[10px] uppercase tracking-wider pt-1">Crews assigned</div>
        {assigned.length === 0 ? (
          <div className="text-muted text-[11px] italic">no crew assigned</div>
        ) : (
          <ul className="space-y-0.5">
            {assigned.map((th) => {
              const team = teams.find((t) => t._id === th.teamId);
              return (
                <li key={th._id} className="flex items-center px-1.5 py-1 bg-bg/30 font-mono text-xs">
                  <span className="text-cyan">{team?.code ?? '?'}</span>
                  <span className="text-muted ml-2 truncate">{team?.role ?? ''}</span>
                  <span className="text-muted ml-2 text-[10px] uppercase">{th.kind}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted hover:text-red"
                    disabled={deleteThread.isPending}
                    onClick={() => deleteThread.mutate({ layerId: interceptor.layerId, id: th._id })}
                    aria-label={`Remove ${team?.code ?? 'crew'}`}
                  >
                    <X size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {availableTeams.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className={inputCls + ' flex-1'}
              value={addTeamId}
              onChange={(e) => setAddTeamId(e.target.value)}
            >
              <option value="">add a crew…</option>
              {availableTeams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.code} — {t.role}{t.isElite ? ' (elite)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttonGhost}
              disabled={!addTeamId || createThread.isPending}
              onClick={() => {
                const t = availableTeams.find((x) => x._id === addTeamId);
                if (!t) return;
                createThread.mutate({
                  layerId: interceptor.layerId,
                  teamId: t._id,
                  interceptorId: interceptor._id,
                  kind: t.isElite ? 'override' : 'primary',
                });
                setAddTeamId('');
              }}
            >
              Add
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className={buttonDanger}
            disabled={deleteInstance.isPending}
            onClick={async () => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              try {
                await deleteInstance.mutateAsync({ layerId: interceptor.layerId, id: interceptor._id });
                setSelection(null);
                onOpenChange(false);
              } catch { /* surfaced by mutation onError */ }
            }}
          >
            {deleteInstance.isPending ? 'Deleting…' : confirmDelete ? 'Click again to confirm' : 'Delete'}
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonGhost} onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className={buttonPrimary} disabled={updateInstance.isPending}>
              {updateInstance.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
