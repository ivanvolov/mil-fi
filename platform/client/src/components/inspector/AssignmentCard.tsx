import type { ReactNode } from 'react';

export type AssignmentBadge = { label: string; color: string };
export type AssignmentMetric = { label: string; value: ReactNode };

export type AssignmentCardProps = {
  code: string;
  /** Short category tag rendered next to the code (e.g. INTERCEPTOR, MFG, MANPADS). */
  categoryLabel?: string;
  categoryColor?: string;
  /** Full type display name, rendered on the second line. */
  typeName?: string;
  /** Small tag rendered before the code (e.g. PRI / BKP / MFG role). */
  leftBadge?: AssignmentBadge;
  /** Small tag rendered on the right of the top row (e.g. RECOMMEND, RELOADING, OUT OF RANGE). */
  rightBadge?: AssignmentBadge;
  /** Metric grid below the type name; columns auto-fit to count (max 3). Omit to hide. */
  metrics?: AssignmentMetric[];
  /** Optional footer line under the metrics for extra context (e.g. "range margin · ammo"). */
  footer?: ReactNode;
  selected?: boolean;
  /** Highlight style — used for the per-threat "Recommended" row. */
  highlight?: boolean;
  /** Dim style — used for infeasible rows. */
  dim?: boolean;
  onClick?: () => void;
};

export function AssignmentCard({
  code, categoryLabel, categoryColor, typeName,
  leftBadge, rightBadge, metrics, footer,
  selected, highlight, dim, onClick,
}: AssignmentCardProps) {
  const hasMetrics = !!metrics && metrics.length > 0;
  const colCount = Math.min(3, metrics?.length ?? 0);

  const stateCls = highlight
    ? 'border-cyan bg-cyan/5'
    : selected
      ? 'border-cyan/70'
      : 'border-line hover:border-cyan/50';
  const dimCls = dim ? 'opacity-60 hover:opacity-100' : '';
  const cursorCls = onClick ? 'cursor-pointer' : '';

  return (
    <div
      onClick={onClick}
      className={`border px-2.5 py-2 ${cursorCls} ${stateCls} ${dimCls}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {leftBadge && (
            <span
              className="font-mono text-[9px] uppercase tracking-wider shrink-0"
              style={{ color: leftBadge.color }}
            >
              {leftBadge.label}
            </span>
          )}
          <span className="font-mono text-sm text-ink">{code}</span>
          {categoryLabel && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: categoryColor }}
            >
              {categoryLabel}
            </span>
          )}
        </div>
        {rightBadge && (
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0"
            style={{ color: rightBadge.color }}
          >
            {rightBadge.label}
          </span>
        )}
      </div>

      {typeName && (
        <div className="text-[10px] text-muted font-mono mt-0.5 truncate">{typeName}</div>
      )}

      {hasMetrics && (
        <div
          className="grid gap-2 mt-2 font-mono text-[10px]"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {metrics!.map((m, i) => (
            <div key={i}>
              <div className="text-muted uppercase tracking-wider text-[9px]">{m.label}</div>
              <div className="text-ink">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {footer && (
        <div className="font-mono text-[10px] text-muted mt-1">{footer}</div>
      )}
    </div>
  );
}
