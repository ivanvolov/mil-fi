import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LayerCreate } from '@shared/schemas/layer';
import type { LatLng } from '@shared/schemas/common';
import type { Threat, ThreatCreate, ThreatPatch } from '@shared/schemas/threat';
import type { InterceptorCreate, InterceptorPatch } from '@shared/schemas/interceptor';
import type { TeamCreate, TeamPatch } from '@shared/schemas/team';
import type { Drawing, DrawingCreate } from '@shared/schemas/drawing';
import type { InterceptorTypePatch } from '@shared/schemas/interceptor-type';
import type { ThreatTypePatch, ThreatTypeCreate } from '@shared/schemas/threat-type';

function layerKey(slug: string) {
  return ['layer-full', slug] as const;
}

export function useUpdateInterceptorPosition(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, position, version }: { layerId: string; id: string; position: LatLng; version: number }) =>
      api.patchInterceptorPosition(layerId, id, position, version),
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: layerKey(slug) });
      const prev = qc.getQueryData<LayerFull>(layerKey(slug));
      if (prev) {
        qc.setQueryData<LayerFull>(layerKey(slug), {
          ...prev,
          interceptors: prev.interceptors.map((i) =>
            i._id === id ? { ...i, position } : i,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(layerKey(slug), ctx.prev);
    },
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev
          ? { ...prev, interceptors: prev.interceptors.map((i) => (i._id === updated._id ? updated : i)) }
          : prev,
      );
    },
    onSettled: (_data, error) => {
      // on 409 STALE: refetch to resync
      if (error instanceof ApiError && error.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useUpdateTeamPosition(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, position, version }: { layerId: string; id: string; position: LatLng; version: number }) =>
      api.patchTeamPosition(layerId, id, position, version),
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: layerKey(slug) });
      const prev = qc.getQueryData<LayerFull>(layerKey(slug));
      if (prev) {
        qc.setQueryData<LayerFull>(layerKey(slug), {
          ...prev,
          teams: prev.teams.map((t) => (t._id === id ? { ...t, position } : t)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(layerKey(slug), ctx.prev);
    },
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, teams: prev.teams.map((t) => (t._id === updated._id ? updated : t)) } : prev,
      );
    },
    onSettled: (_data, error) => {
      if (error instanceof ApiError && error.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

function deleteFromLayer<K extends 'interceptors' | 'teams' | 'threats' | 'drawings'>(prev: LayerFull, key: K, id: string): LayerFull {
  return { ...prev, [key]: prev[key].filter((x: any) => x._id !== id) } as LayerFull;
}

function surfaceError(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[${label}]`, err);
  // v1 — no toast component yet; alert is intrusive but at least visible
  alert(`${label} failed: ${msg}`);
}

export function useDeleteInterceptor(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ layerId, id }: { layerId: string; id: string }) => {
      try {
        return await api.deleteInterceptor(layerId, id);
      } catch (e) {
        // Idempotent delete: the launcher may already be gone (another operator, a re-place, or a
        // staging DB refresh). Treat "not found" as success so the Manage-Assets wipe doesn't
        // alert over rows that are already deleted.
        if (e instanceof ApiError && e.status === 404) return { ok: true } as const;
        throw e;
      }
    },
    onSuccess: (_r, { id }) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) => prev ? {
        ...deleteFromLayer(prev, 'interceptors', id),
        threads: prev.threads.filter((t) => t.interceptorId !== id),
      } : prev);
    },
    onError: (err) => surfaceError('Delete interceptor', err),
  });
}

export function useDeleteTeam(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ layerId, id }: { layerId: string; id: string }) => {
      try {
        return await api.deleteTeam(layerId, id);
      } catch (e) {
        // Idempotent delete — see useDeleteInterceptor. Already-gone crews shouldn't alert during
        // the Manage-Assets wipe.
        if (e instanceof ApiError && e.status === 404) return { ok: true } as const;
        throw e;
      }
    },
    onSuccess: (_r, { id }) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) => prev ? {
        ...deleteFromLayer(prev, 'teams', id),
        threads: prev.threads.filter((t) => t.teamId !== id),
      } : prev);
    },
    onError: (err) => surfaceError('Delete crew', err),
  });
}

export function useDeleteThreat(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id }: { layerId: string; id: string }) => api.deleteThreat(layerId, id),
    onSuccess: (_r, { id }) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) => prev ? deleteFromLayer(prev, 'threats', id) : prev);
    },
    onError: (err) => surfaceError('Delete threat', err),
  });
}

export function useDeleteDrawing(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id }: { layerId: string; id: string }) => api.deleteDrawing(layerId, id),
    onSuccess: (_r, { id }) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) => prev ? deleteFromLayer(prev, 'drawings', id) : prev);
    },
    onError: (err) => surfaceError('Delete restriction', err),
  });
}

export function useCreateInterceptor(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, body }: { layerId: string; body: InterceptorCreate }) =>
      api.createInterceptor(layerId, body),
    onSuccess: (created) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, interceptors: [...prev.interceptors, created] } : prev,
      );
    },
    onError: (err) => surfaceError('Create launcher', err),
  });
}

export function useCreateThreat(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, body }: { layerId: string; body: ThreatCreate }) =>
      api.createThreat(layerId, body),
    onSuccess: (created) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, threats: [...prev.threats, created] } : prev,
      );
    },
    onError: (err) => surfaceError('Create threat', err),
  });
}

export function useCreateTeam(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, body }: { layerId: string; body: TeamCreate }) =>
      api.createTeam(layerId, body),
    onSuccess: (created) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, teams: [...prev.teams, created] } : prev,
      );
    },
    onError: (err) => surfaceError('Create crew', err),
  });
}

export function useCreateDrawing(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, body }: { layerId: string; body: DrawingCreate }) =>
      api.createDrawing(layerId, body),
    onSuccess: (created) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, drawings: [...prev.drawings, created as Drawing] } : prev,
      );
    },
    onError: (err) => surfaceError('Create restriction', err),
  });
}

export function useUpdateDrawingGeometry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, geometry, version }: { layerId: string; id: string; geometry: Drawing['geometry']; version: number }) =>
      api.patchDrawing(layerId, id, { geometry }, version) as Promise<Drawing>,
    onMutate: async ({ id, geometry }) => {
      await qc.cancelQueries({ queryKey: layerKey(slug) });
      const prev = qc.getQueryData<LayerFull>(layerKey(slug));
      if (prev) {
        qc.setQueryData<LayerFull>(layerKey(slug), {
          ...prev,
          drawings: prev.drawings.map((d) => (d._id === id ? { ...d, geometry } : d)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(layerKey(slug), ctx.prev);
    },
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, drawings: prev.drawings.map((d) => (d._id === updated._id ? updated : d)) } : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useCreateThread(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, teamId, interceptorId, kind }: { layerId: string; teamId: string; interceptorId: string; kind: 'primary' | 'override' }) =>
      api.createThread(layerId, { teamId, interceptorId, kind }),
    onSuccess: () => qc.invalidateQueries({ queryKey: layerKey(slug) }),
  });
}

export function useDeleteThread(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id }: { layerId: string; id: string }) => api.deleteThread(layerId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: layerKey(slug) }),
  });
}

export function useUpdateInterceptor(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, patch, version }: { layerId: string; id: string; patch: InterceptorPatch; version: number }) =>
      api.patchInterceptor(layerId, id, patch, version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, interceptors: prev.interceptors.map((i) => (i._id === updated._id ? updated : i)) } : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useUpdateTeam(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, patch, version }: { layerId: string; id: string; patch: TeamPatch; version: number }) =>
      api.patchTeam(layerId, id, patch, version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, teams: prev.teams.map((t) => (t._id === updated._id ? updated : t)) } : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useUpdateThreat(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layerId, id, patch, version }: { layerId: string; id: string; patch: ThreatPatch; version: number }) =>
      api.patchThreat(layerId, id, patch, version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, threats: prev.threats.map((t) => (t._id === updated._id ? updated : t)) } : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useUpdateInterceptorType(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, expectedAffectedCount, version }: { id: string; patch: InterceptorTypePatch; expectedAffectedCount: number; version: number }) =>
      api.patchInterceptorType(id, { patch, expectedAffectedCount }, version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev
          ? {
              ...prev,
              types: {
                ...prev.types,
                interceptor: prev.types.interceptor.map((t) => (t._id === updated._id ? updated : t)),
              },
            }
          : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && (err.code === 'STALE' || err.code === 'AFFECTED_COUNT_CHANGED')) {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

export function useUpdateThreatType(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, expectedAffectedCount, version }: { id: string; patch: ThreatTypePatch; expectedAffectedCount: number; version: number }) =>
      api.patchThreatType(id, { patch, expectedAffectedCount }, version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev
          ? {
              ...prev,
              types: {
                ...prev.types,
                threat: prev.types.threat.map((t) => (t._id === updated._id ? updated : t)),
              },
            }
          : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && (err.code === 'STALE' || err.code === 'AFFECTED_COUNT_CHANGED')) {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}

/** Patch a threat-type's own fields (e.g. descentPhaseM) from the catalog/settings page — plain
 *  patch, no affected-count gate. Invalidates the global threat-types list. */
export function useUpdateThreatTypeFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, version }: { id: string; patch: ThreatTypePatch; version: number }) =>
      api.patchThreatTypeFields(id, patch, version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['types', 'threat'] });
      // The map's layer-full carries its own copy of the threat types; refresh it so the donut
      // picks up the new descent immediately.
      qc.invalidateQueries({ queryKey: ['layer-full'] });
    },
    onError: (err) => surfaceError('Update threat type', err),
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') qc.invalidateQueries({ queryKey: ['types', 'threat'] });
    },
  });
}

/** Duplicate a threat type (create a new one from copied fields with a fresh key) — the catalog
 *  workflow for making a variant instead of editing individual threats. */
export function useDuplicateThreatType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ThreatTypeCreate) => api.createThreatType(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['types', 'threat'] });
      qc.invalidateQueries({ queryKey: ['layer-full'] });
    },
    onError: (err) => surfaceError('Duplicate threat type', err),
  });
}

export function useCreateLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LayerCreate) => api.createLayer(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layers'] }),
    onError: (err) => surfaceError('Create sector', err),
  });
}

export function useDuplicateLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, slug }: { id: string; name?: string; slug?: string }) =>
      api.duplicateLayer(id, { name, slug }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layers'] }),
    onError: (err) => surfaceError('Duplicate sector', err),
  });
}

export function useRenameLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, version }: { id: string; name: string; version: number }) =>
      api.patchLayer(id, { name }, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layers'] }),
    onError: (err) => surfaceError('Rename sector', err),
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: ['layers'] });
      }
    },
  });
}

export function useDeleteLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.deleteLayer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layers'] }),
    onError: (err) => surfaceError('Delete sector', err),
  });
}

export function useUpdateThreatGeometry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      layerId,
      id,
      geometry,
      position,
      version,
    }: {
      layerId: string;
      id: string;
      geometry: Threat['geometry'];
      position?: LatLng;
      version: number;
    }) => api.patchThreatGeometry(layerId, id, geometry, position, version),
    onMutate: async ({ id, geometry, position }) => {
      await qc.cancelQueries({ queryKey: layerKey(slug) });
      const prev = qc.getQueryData<LayerFull>(layerKey(slug));
      if (prev) {
        qc.setQueryData<LayerFull>(layerKey(slug), {
          ...prev,
          threats: prev.threats.map((t) =>
            t._id === id ? { ...t, geometry, position: position ?? t.position } : t,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(layerKey(slug), ctx.prev);
    },
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(layerKey(slug), (prev) =>
        prev ? { ...prev, threats: prev.threats.map((t) => (t._id === updated._id ? updated : t)) } : prev,
      );
    },
    onSettled: (_data, error) => {
      if (error instanceof ApiError && error.code === 'STALE') {
        qc.invalidateQueries({ queryKey: layerKey(slug) });
      }
    },
  });
}
