import { useMemo, useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { FEEDBACK_ETA_MS, type PipelineStage } from '../../lib/releases-mock';
import { PipelineCard, STAGE_COLOR, STAGE_LABEL } from './PipelineCard';

// Rising pipeline: most-mature stage on top, freshest at the bottom — so newly-submitted
// feedback drops in at the bottom (conceptualizing), right above the composer.
const STAGE_ORDER: PipelineStage[] = ['testing', 'coding', 'conceptualizing'];

let feedbackSeq = 0;

export function PipelineBoard() {
  const pipelineItems = useUiStore((s) => s.pipelineItems);
  const addPipelineItem = useUiStore((s) => s.addPipelineItem);
  const [draft, setDraft] = useState('');

  const byStage = useMemo(() => {
    const m: Record<PipelineStage, typeof pipelineItems> = { conceptualizing: [], coding: [], testing: [] };
    for (const it of pipelineItems) m[it.stage].push(it);
    return m;
  }, [pipelineItems]);

  function submitFeedback(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    feedbackSeq += 1;
    addPipelineItem({
      id: `fb-${Date.now()}-${feedbackSeq}`,
      title: trimmed,
      detail: 'checking if it makes sense…',
      stage: 'conceptualizing',
      startedAt: Date.now(),
      etaMs: FEEDBACK_ETA_MS,
      kind: 'feature',
    });
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-5 py-3 border-b border-line shrink-0">
        <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-muted">Update pipeline</div>
        <div className="font-mono text-sm text-ink mt-0.5">
          {pipelineItems.length} feature{pipelineItems.length === 1 ? '' : 's'} in flight
        </div>
        <div className="text-[10px] text-muted font-mono mt-0.5">
          autonomous agent · nearest release on top, freshest ideas at the bottom
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {STAGE_ORDER.map((stage) => (
          <section key={stage}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
              <span
                className="text-[10px] uppercase tracking-[0.08em] font-mono"
                style={{ color: STAGE_COLOR[stage] }}
              >
                {STAGE_LABEL[stage]}
              </span>
              <span className="text-[10px] font-mono text-muted">{byStage[stage].length}</span>
            </div>
            {byStage[stage].length === 0 ? (
              <div className="text-[10px] text-muted font-mono px-1 py-2">— nothing here —</div>
            ) : (
              <div className="space-y-2">
                {byStage[stage].map((item) => (
                  <PipelineCard key={item.id} item={item} onFeedback={submitFeedback} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* feedback composer — feeds the conceptualizing stage */}
      <form
        className="border-t border-line p-3 shrink-0 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitFeedback(draft);
          setDraft('');
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-muted">Send feedback</div>
        <textarea
          className="w-full bg-bg border border-line text-ink font-mono text-xs px-2 py-1.5 rounded-sm focus:outline-none focus:border-cyan resize-none"
          rows={2}
          placeholder="Describe a feature or give feedback — it enters conceptualizing to be evaluated…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!draft.trim()}
            className="bg-cyan/10 border border-cyan text-cyan font-mono text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send to pipeline
          </button>
        </div>
      </form>
    </div>
  );
}
