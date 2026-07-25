import { useUiStore } from '../../stores/uiStore';
import { Chip } from '../shared/Chip';
import { VERSIONS } from '../../lib/releases-mock';

export function VersionList() {
  const selectedVersionId = useUiStore((s) => s.selectedVersionId);
  const selectVersion = useUiStore((s) => s.selectVersion);

  return (
    <aside className="w-[300px] border-r border-line bg-panel flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-line shrink-0">
        <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-muted">Versions</div>
        <div className="text-[10px] text-muted font-mono mt-1 leading-snug">
          Select a build to preview it in the live UI — e.g. hiding the Manage Assets button.
        </div>
      </div>

      <div className="p-3 space-y-2">
        {VERSIONS.map((v) => {
          const selected = v.selectable && v.id === selectedVersionId;
          const clickable = v.selectable;
          const stateCls = selected
            ? 'border-cyan bg-cyan/5'
            : clickable
              ? 'border-line hover:border-cyan/50 cursor-pointer'
              : 'border-line opacity-50 cursor-not-allowed';
          return (
            <div
              key={v.id}
              className={`border px-3 py-2.5 ${stateCls}`}
              onClick={() => { if (clickable) selectVersion(v.id, v.flags); }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink">{v.name}</span>
                {v.released ? (
                  <Chip color="#22c55e" soft>RELEASED</Chip>
                ) : selected ? (
                  <Chip color="#06b6d4">ACTIVE</Chip>
                ) : (
                  <Chip color="#8b949e" soft>PREVIEW</Chip>
                )}
              </div>
              <div className="font-mono text-[10px] text-muted mt-1 leading-snug">{v.blurb}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
