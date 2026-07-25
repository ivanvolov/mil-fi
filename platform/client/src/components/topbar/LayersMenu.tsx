import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check } from 'lucide-react';
import { useUiStore, type Visibility } from '../../stores/uiStore';

type Toggle = {
  key: keyof Visibility;
  label: string;
  color: string;
  /** if any of these is off, this toggle is disabled (auto-suppressed) */
  dependsOn?: Array<keyof Visibility>;
};

const TOGGLES: Toggle[] = [
  { key: 'threats',      label: 'Threats',      color: '#ef4444' },
  { key: 'interceptors', label: 'Launchers',    color: '#06b6d4' },
  { key: 'teams',        label: 'Crews',        color: '#06b6d4' },
  { key: 'controls',     label: 'Controls',     color: '#06b6d4', dependsOn: ['teams', 'interceptors'] },
  { key: 'coverage',     label: 'Coverage',     color: '#06b6d4' },
  { key: 'restrictions', label: 'Restrictions', color: '#b04a3a' },
  { key: 'heatmap',      label: 'Heatmap',      color: '#f59e0b' },
];

export function LayersMenu() {
  const visibility = useUiStore((s) => s.visibility);
  const toggle = useUiStore((s) => s.toggleVisibility);

  const visibleCount = TOGGLES.filter((t) => visibility[t.key] && (!t.dependsOn || t.dependsOn.every((d) => visibility[d]))).length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 border border-line text-ink font-mono text-xs hover:border-cyan focus:outline-none focus:border-cyan"
        >
          <span className="text-muted uppercase tracking-wider text-[10px]">Layers</span>
          <span className="text-cyan">{visibleCount}</span>
          <span className="text-muted">/ {TOGGLES.length}</span>
          <ChevronDown size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="bg-panel border border-line shadow-2xl z-[2000] w-56 p-1 font-mono text-xs"
          sideOffset={4}
          align="end"
        >
          {TOGGLES.map((t) => {
            const blocked = t.dependsOn?.some((d) => !visibility[d]) ?? false;
            const on = visibility[t.key] && !blocked;
            return (
              <button
                key={t.key}
                type="button"
                disabled={blocked}
                onClick={() => toggle(t.key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 outline-none ${
                  blocked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-bg/60'
                }`}
                title={blocked ? `disabled — requires ${t.dependsOn!.join(' + ')}` : undefined}
              >
                <span className="w-3 inline-flex items-center justify-center" style={{ color: t.color }}>
                  {on ? <Check size={11} /> : ''}
                </span>
                <span className="w-2 h-2 rounded-sm" style={{ background: t.color, opacity: on ? 1 : 0.3 }} />
                <span className="text-ink">{t.label}</span>
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
