import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import type { Team } from '@shared/schemas/team';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { Thread } from '@shared/schemas/thread';
import {
  useUpdateTeam,
  useDeleteTeam,
  useCreateThread,
  useDeleteThread,
} from '../../queries/useMutations';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost, buttonDanger } from '../shared/Dialog';
import { useUiStore } from '../../stores/uiStore';

type Form = {
  code: string;
  positionLat: number;
  positionLng: number;
  role: string;
  isElite: boolean;
};

export function TeamEditDialog({
  open,
  onOpenChange,
  slug,
  team,
  interceptors,
  threads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  team: Team;
  interceptors: Interceptor[];
  threads: Thread[];
}) {
  const update = useUpdateTeam(slug);
  const del = useDeleteTeam(slug);
  const createThread = useCreateThread(slug);
  const deleteThread = useDeleteThread(slug);
  const setSelection = useUiStore((s) => s.setSelection);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (open) setConfirmDelete(false); }, [open]);

  const assigned = useMemo(
    () => threads.filter((t) => t.teamId === team._id),
    [threads, team._id],
  );
  const assignedInterceptorIds = useMemo(() => new Set(assigned.map((t) => t.interceptorId)), [assigned]);
  const availableInterceptors = useMemo(
    () => interceptors.filter((i) => !assignedInterceptorIds.has(i._id)),
    [interceptors, assignedInterceptorIds],
  );
  const [addInterceptorId, setAddInterceptorId] = useState<string>('');
  useEffect(() => { setAddInterceptorId(''); }, [team._id, assigned.length]);
  const defaults: Form = useMemo(
    () => ({
      code: team.code,
      positionLat: team.position.lat,
      positionLng: team.position.lng,
      role: team.role,
      isElite: team.isElite,
    }),
    [team],
  );
  const form = useForm<Form>({ defaultValues: defaults, values: defaults });

  const onSubmit = form.handleSubmit(async (v) => {
    await update.mutateAsync({
      layerId: team.layerId,
      id: team._id,
      version: team.version,
      patch: {
        code: v.code,
        position: { lat: Number(v.positionLat), lng: Number(v.positionLng) },
        role: v.role,
        isElite: v.isElite,
      },
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${team.code}`} subtitle="crew (team)" width={520}>
      <form className="p-5 space-y-3" onSubmit={onSubmit}>
        <FormField label="Code">
          <input className={inputCls} {...form.register('code', { required: true })} />
        </FormField>
        <FormField label="Role">
          <input className={inputCls} {...form.register('role')} />
        </FormField>
        <FormField label="Position (lat / lng)">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} type="number" step="0.000001" {...form.register('positionLat', { valueAsNumber: true })} />
            <input className={inputCls} type="number" step="0.000001" {...form.register('positionLng', { valueAsNumber: true })} />
          </div>
        </FormField>
        <FormField label="Elite (can override)">
          <select
            className={inputCls}
            {...form.register('isElite', { setValueAs: (v) => v === 'true' || v === true })}
          >
            <option value="false">no — local crew</option>
            <option value="true">yes — elite, override-capable</option>
          </select>
        </FormField>

        <div className="text-muted text-[10px] uppercase tracking-wider pt-1">Launchers controlled</div>
        {assigned.length === 0 ? (
          <div className="text-muted text-[11px] italic">no launchers controlled</div>
        ) : (
          <ul className="space-y-0.5">
            {assigned.map((th) => {
              const i = interceptors.find((x) => x._id === th.interceptorId);
              return (
                <li key={th._id} className="flex items-center px-1.5 py-1 bg-bg/30 font-mono text-xs">
                  <span className="text-cyan">{i?.code ?? '?'}</span>
                  <span className="text-muted ml-2 text-[10px] uppercase">{th.kind}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted hover:text-red"
                    disabled={deleteThread.isPending}
                    onClick={() => deleteThread.mutate({ layerId: team.layerId, id: th._id })}
                    aria-label={`Remove ${i?.code ?? 'launcher'}`}
                  >
                    <X size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {availableInterceptors.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className={inputCls + ' flex-1'}
              value={addInterceptorId}
              onChange={(e) => setAddInterceptorId(e.target.value)}
            >
              <option value="">add a launcher…</option>
              {availableInterceptors.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.code}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttonGhost}
              disabled={!addInterceptorId || createThread.isPending}
              onClick={() => {
                if (!addInterceptorId) return;
                createThread.mutate({
                  layerId: team.layerId,
                  teamId: team._id,
                  interceptorId: addInterceptorId,
                  kind: team.isElite ? 'override' : 'primary',
                });
                setAddInterceptorId('');
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
            disabled={del.isPending}
            onClick={async () => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              try {
                await del.mutateAsync({ layerId: team.layerId, id: team._id });
                setSelection(null);
                onOpenChange(false);
              } catch { /* mutation onError surfaces */ }
            }}
          >
            {del.isPending ? 'Deleting…' : confirmDelete ? 'Click again to confirm' : 'Delete crew'}
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonGhost} onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className={buttonPrimary} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
