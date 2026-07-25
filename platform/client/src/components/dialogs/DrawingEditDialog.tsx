import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Drawing } from '@shared/schemas/drawing';
import type { LayerFull } from '@shared/schemas/layer-full';
import { api, ApiError } from '../../api/client';
import { useDeleteDrawing } from '../../queries/useMutations';
import { Dialog, FormField, inputCls, buttonPrimary, buttonGhost, buttonDanger } from '../shared/Dialog';
import { useUiStore } from '../../stores/uiStore';
import { drawingKindFullLabel, drawingGeometryDesc } from '../../lib/drawing-labels';
import { POLYGON_POINTS_MAX, POLYGON_POINTS_MIN, resamplePolygonPoints } from '../../lib/polygon-resample';

type Form = { name: string; visible: boolean; points: number };

export function DrawingEditDialog({
  open,
  onOpenChange,
  slug,
  drawing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  drawing: Drawing;
}) {
  const qc = useQueryClient();
  const del = useDeleteDrawing(slug);
  const setSelection = useUiStore((s) => s.setSelection);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (open) setConfirmDelete(false); }, [open]);

  const update = useMutation({
    mutationFn: ({ patch }: { patch: Record<string, unknown> }) =>
      api.patchDrawing(drawing.layerId, drawing._id, patch, drawing.version),
    onSuccess: (updated) => {
      qc.setQueryData<LayerFull>(['layer-full', slug], (prev) =>
        prev ? { ...prev, drawings: prev.drawings.map((d) => (d._id === drawing._id ? (updated as Drawing) : d)) } : prev,
      );
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.code === 'STALE') {
        qc.invalidateQueries({ queryKey: ['layer-full', slug] });
      }
    },
  });

  const isPolygon = drawing.geometry.type === 'polygon';
  const currentPoints = drawing.geometry.type === 'polygon' ? drawing.geometry.points.length : 0;

  const defaults: Form = useMemo(
    () => ({ name: drawing.name ?? '', visible: drawing.visible, points: currentPoints }),
    [drawing, currentPoints],
  );
  const form = useForm<Form>({ defaultValues: defaults, values: defaults });

  const submit = form.handleSubmit(async (v) => {
    const patch: Record<string, unknown> = { name: v.name || null, visible: v.visible };
    if (drawing.geometry.type === 'polygon') {
      const target = Math.max(POLYGON_POINTS_MIN, Math.min(POLYGON_POINTS_MAX, Math.round(v.points || currentPoints)));
      if (target !== currentPoints) {
        patch.geometry = { type: 'polygon', points: resamplePolygonPoints(drawing.geometry.points, target) };
      }
    }
    await update.mutateAsync({ patch });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${drawingKindFullLabel(drawing.kind)}`} subtitle={drawingGeometryDesc(drawing.geometry)} width={420}>
      <form className="p-5 space-y-3" onSubmit={submit}>
        <FormField label="Name">
          <input className={inputCls} {...form.register('name')} />
        </FormField>
        <FormField label="Visible on map">
          <select className={inputCls} {...form.register('visible', { setValueAs: (v) => v === 'true' || v === true })}>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </FormField>
        {isPolygon && (
          <FormField label={`Points (${POLYGON_POINTS_MIN}–${POLYGON_POINTS_MAX})`}>
            <input
              type="number"
              min={POLYGON_POINTS_MIN}
              max={POLYGON_POINTS_MAX}
              step={1}
              className={inputCls}
              {...form.register('points', { valueAsNumber: true })}
            />
          </FormField>
        )}
        <div className="text-muted text-[10px]">
          To reshape on the map: enable edit mode, then drag the centroid handle to move, vertex handles to reshape.
          {isPolygon && ' Changing the point count keeps the shape: new points are added on the longest edges, and the least significant ones are removed.'}
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className={buttonDanger}
            disabled={del.isPending}
            onClick={async () => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              try {
                await del.mutateAsync({ layerId: drawing.layerId, id: drawing._id });
                setSelection(null);
                onOpenChange(false);
              } catch { /* mutation onError surfaces */ }
            }}
          >
            {del.isPending ? 'Deleting…' : confirmDelete ? 'Click again to confirm' : 'Delete restriction'}
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
