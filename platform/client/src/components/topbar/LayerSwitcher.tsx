import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayers } from '../../queries/useLayers';
import { useCreateLayer, useDeleteLayer, useDuplicateLayer, useRenameLayer } from '../../queries/useMutations';

const DEFAULT_CENTER = { lat: 49.31928, lng: 24.66619 };
const DEFAULT_ZOOM = 11.75;

// Slugs are an internal, URL-only id — never shown in the UI and never derived
// from the name (or from the source slug on duplicate — no `-copy-copy` cascades).
// Format: 8-char lowercase base36 (a-z + 0-9). 36⁸ ≈ 2.8 trillion, so collisions
// are astronomically rare; we still retry a handful of times against the loaded
// set, and the server enforces uniqueness via 409 DUPLICATE_SLUG as backstop.
function generateLayerSlug(taken: Set<string>): string {
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = '';
    for (let i = 0; i < 8; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    if (!taken.has(s)) return s;
  }
  return String(Date.now()).slice(-8);
}

export function LayerSwitcher() {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { slug = 'vzil-1' } = useParams();
  const layersQ = useLayers();
  const createLayerM = useCreateLayer();
  const duplicateLayerM = useDuplicateLayer();
  const renameLayerM = useRenameLayer();
  const deleteLayerM = useDeleteLayer();

  const layers = layersQ.data ?? [];
  const current = layers.find((l) => l.slug === slug);

  // Reset the armed delete whenever the popover closes.
  useEffect(() => {
    if (!open) setConfirmingDeleteId(null);
  }, [open]);

  function handleCreate() {
    const seedCenter = current?.mapCenter ?? layers[0]?.mapCenter ?? DEFAULT_CENTER;
    const seedZoom = current?.mapZoom ?? layers[0]?.mapZoom ?? DEFAULT_ZOOM;
    const slugSet = new Set(layers.map((l) => l.slug));
    const newSlug = generateLayerSlug(slugSet);
    createLayerM.mutate(
      { name: 'New sector', slug: newSlug, description: null, mapCenter: seedCenter, mapZoom: seedZoom },
      {
        onSuccess: (created) => {
          setOpen(false);
          navigate(`/layers/${created.slug}`);
        },
      },
    );
  }

  function handleDuplicate(id: string) {
    const slugSet = new Set(layers.map((l) => l.slug));
    const newSlug = generateLayerSlug(slugSet);
    duplicateLayerM.mutate(
      { id, slug: newSlug },
      {
        onSuccess: (created) => {
          setOpen(false);
          navigate(`/layers/${created.slug}`);
        },
      },
    );
  }

  function handleDelete(id: string, deletedSlug: string) {
    deleteLayerM.mutate(
      { id },
      {
        onSuccess: () => {
          setConfirmingDeleteId(null);
          // If we just deleted the active sector, jump to another one.
          if (deletedSlug === slug) {
            const next = layers.find((l) => l._id !== id);
            if (next) {
              setOpen(false);
              navigate(`/layers/${next.slug}`);
            }
          }
        },
      },
    );
  }

  function commitRename(id: string, version: number, nextName: string, originalName: string) {
    const trimmed = nextName.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === originalName) return;
    renameLayerM.mutate({ id, name: trimmed, version });
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-2 py-1 border border-line text-ink font-mono text-xs hover:border-cyan focus:outline-none focus:border-cyan"
        >
          <span className="text-muted uppercase tracking-wider text-[10px]">Sector</span>
          <span className="text-ink">{current?.name ?? '—'}</span>
          {current?.description && <span className="text-muted text-[10px] hidden md:inline">· {current.description}</span>}
          <ChevronDown size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="bg-panel border border-line shadow-2xl z-[2000] w-80 font-mono text-xs"
          sideOffset={4}
          align="start"
        >
          <div className="text-muted uppercase tracking-wider text-[10px] px-3 py-2 border-b border-line">Switch sector</div>
          <ul className="py-1 max-h-72 overflow-y-auto">
            {layers.map((l) => {
              const active = l.slug === slug;
              const isRenaming = renamingId === l._id;
              return (
                <li key={l._id} className="group relative">
                  {isRenaming ? (
                    <RenameRow
                      defaultValue={l.name}
                      pending={renameLayerM.isPending}
                      onCancel={() => setRenamingId(null)}
                      onCommit={(next) => commitRename(l._id, l.version, next, l.name)}
                    />
                  ) : (
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => { setOpen(false); navigate(`/layers/${l.slug}`); }}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg/60 outline-none ${active ? 'text-cyan' : 'text-ink'}`}
                      >
                        <span className="w-3 inline-flex items-center justify-center shrink-0">{active && <Check size={11} />}</span>
                        <span className="flex-1 truncate">{l.name}</span>
                      </button>
                      <div className="flex items-center pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <IconButton
                          title="Rename"
                          onClick={() => { setConfirmingDeleteId(null); setRenamingId(l._id); }}
                        >
                          <Pencil size={11} />
                        </IconButton>
                        <IconButton
                          title="Duplicate"
                          onClick={() => handleDuplicate(l._id)}
                          disabled={duplicateLayerM.isPending}
                        >
                          <Copy size={11} />
                        </IconButton>
                        {layers.length > 1 && (
                          <IconButton
                            title={confirmingDeleteId === l._id ? 'Click again to confirm' : 'Delete sector'}
                            danger={confirmingDeleteId === l._id}
                            onClick={() => {
                              if (confirmingDeleteId === l._id) handleDelete(l._id, l.slug);
                              else setConfirmingDeleteId(l._id);
                            }}
                            disabled={deleteLayerM.isPending}
                          >
                            <Trash2 size={11} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createLayerM.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg/60 outline-none text-ink disabled:opacity-50"
            >
              <Plus size={12} />
              <span>New sector</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`p-1 disabled:opacity-50 outline-none ${danger ? 'text-red-400 hover:text-red-300' : 'text-muted hover:text-cyan'}`}
    >
      {children}
    </button>
  );
}

function RenameRow({
  defaultValue,
  pending,
  onCommit,
  onCancel,
}: {
  defaultValue: string;
  pending: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="flex items-center px-3 py-1.5 gap-2">
      <span className="w-3 inline-flex items-center justify-center shrink-0">
        <Pencil size={11} className="text-muted" />
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => onCommit(value)}
        className="flex-1 min-w-0 bg-bg border border-line px-2 py-0.5 text-ink outline-none focus:border-cyan disabled:opacity-50"
      />
      <button
        type="button"
        title="Cancel"
        aria-label="Cancel"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="p-1 text-muted hover:text-ink outline-none"
      >
        <X size={11} />
      </button>
    </div>
  );
}
