import { Dialog, buttonGhost, buttonWarn } from '../shared/Dialog';
import type { AffectedReport } from '../../api/client';

export function ConfirmTypeEditDialog({
  open,
  onOpenChange,
  typeName,
  affected,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  typeName: string;
  affected: AffectedReport;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Confirm type edit" width={520}>
      <div className="p-5 space-y-4">
        <div className="text-sm">
          Editing <span className="text-cyan font-mono">{typeName}</span> will update{' '}
          <span className="text-amber font-mono">{affected.instanceCount}</span> instance
          {affected.instanceCount === 1 ? '' : 's'} across{' '}
          <span className="text-amber font-mono">{affected.layerBreakdown.length}</span> layer
          {affected.layerBreakdown.length === 1 ? '' : 's'}.
        </div>
        {affected.layerBreakdown.length > 0 && (
          <ul className="text-xs font-mono text-muted space-y-0.5 pl-3 border-l border-line">
            {affected.layerBreakdown.map((b) => (
              <li key={b.layerId}>
                {b.layerName} — {b.count}
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs text-muted">
          Parameters that propagate: coverage (range/altitude/speed), category, requiresCrew, default loadout. Per-instance
          state (position, current ammo, code) is NOT affected.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonGhost} onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={buttonWarn} onClick={onConfirm} disabled={pending}>
            {pending ? 'Saving…' : `Update ${affected.instanceCount} instance${affected.instanceCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
