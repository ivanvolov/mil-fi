import { useState } from 'react';
import { Chip } from '../shared/Chip';
import { useNow } from '../../hooks/useNow';
import type { PipelineItem, PipelineStage } from '../../lib/releases-mock';

export const STAGE_COLOR: Record<PipelineStage, string> = {
  conceptualizing: '#f59e0b', // amber
  coding: '#06b6d4', // cyan
  testing: '#22c55e', // green
};

export const STAGE_LABEL: Record<PipelineStage, string> = {
  conceptualizing: 'CONCEPTUALIZING',
  coding: 'CODING',
  testing: 'TESTING',
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'finalizing…';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m left`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s left`;
  return `${s}s left`;
}

export function PipelineCard({
  item,
  onFeedback,
}: {
  item: PipelineItem;
  onFeedback?: (text: string) => void;
}) {
  const now = useNow();
  const [note, setNote] = useState('');

  const color = STAGE_COLOR[item.stage];
  const remaining = Math.max(0, item.startedAt + item.etaMs - now);
  const progress = Math.max(0, Math.min(1, (now - item.startedAt) / item.etaMs));

  return (
    <div className="border border-line px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Chip color={color} soft>{STAGE_LABEL[item.stage]}</Chip>
            {item.kind === 'target' && <Chip color="#a78bfa" soft>TARGET</Chip>}
          </div>
          <div className="font-mono text-xs text-ink mt-1.5 leading-snug">{item.title}</div>
          <div className="font-mono text-[10px] text-muted mt-0.5">{item.detail}</div>
        </div>
        <div className="font-mono text-[10px] shrink-0 text-right" style={{ color }}>
          {formatRemaining(remaining)}
        </div>
      </div>

      {/* progress bar */}
      <div className="mt-2 h-1 w-full bg-line rounded-sm overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${progress * 100}%`, background: color }} />
      </div>

      {item.hasFeedbackWindow && onFeedback && (
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const text = note.trim();
            if (!text) return;
            onFeedback(text);
            setNote('');
          }}
        >
          <input
            className="flex-1 bg-bg border border-line text-ink font-mono text-[10px] px-1.5 py-1 rounded-sm focus:outline-none focus:border-cyan"
            placeholder="Add operator feedback for this target…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="submit"
            disabled={!note.trim()}
            className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 border border-line text-muted hover:text-cyan hover:border-cyan disabled:opacity-30"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
