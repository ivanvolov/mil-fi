import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  subtitle,
  width = 720,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 bg-black/60 z-[1000]" />
        <RDialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001] bg-panel border border-line rounded-sm shadow-2xl overflow-hidden"
          style={{ width, maxHeight: '90vh' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-line">
            <div>
              <RDialog.Title className="font-mono text-sm font-bold tracking-wider uppercase text-ink">{title}</RDialog.Title>
              {subtitle && <div className="text-muted text-xs mt-0.5">{subtitle}</div>}
            </div>
            <RDialog.Close className="text-muted hover:text-ink" aria-label="Close">
              <X size={18} />
            </RDialog.Close>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 56px)' }}>{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[10px] uppercase tracking-wider">{label}</span>
      {children}
      {hint && !error && <span className="text-muted text-[10px]">{hint}</span>}
      {error && <span className="text-red text-[10px]">{error}</span>}
    </label>
  );
}

export const inputCls =
  'bg-bg border border-line text-ink font-mono text-xs px-2 py-1.5 rounded-sm focus:outline-none focus:border-cyan';

export const buttonPrimary =
  'bg-cyan/10 border border-cyan text-cyan font-mono text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-cyan/20';
export const buttonGhost =
  'bg-transparent border border-line text-muted font-mono text-xs uppercase tracking-wider px-3 py-1.5 hover:text-ink hover:border-ink';
export const buttonDanger =
  'bg-red/10 border border-red text-red font-mono text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-red/20';
export const buttonWarn =
  'bg-amber/10 border border-amber text-amber font-mono text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-amber/20';
