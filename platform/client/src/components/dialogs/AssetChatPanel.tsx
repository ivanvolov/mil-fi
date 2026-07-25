import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, Check } from 'lucide-react';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type {
  AssetSuggestion,
  ChatMessage,
} from '@shared/schemas/ai-asset-suggest';
import { buttonPrimary, buttonGhost, inputCls } from '../shared/Dialog';
import { useAssetSuggest } from '../../queries/useAssetSuggest';

type AssetRow = { typeId: string; count: string };

type LocalMessage =
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string; suggestions: AssetSuggestion[] }
  | { kind: 'error'; content: string };

const SUGGESTED_PROMPTS = [
  'We\'re not using Marops anymore. What do you recommend?',
  'Suggest a balanced 6-launcher loadout for this sector.',
  'How many crews should I run with this build?',
];

export function AssetChatPanel({
  types,
  rows,
  crewsStr,
  onApplySuggestion,
}: {
  types: InterceptorType[];
  rows: AssetRow[];
  crewsStr: string;
  onApplySuggestion: (changes: { rows: AssetRow[]; crews?: string }) => void;
}) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const suggest = useAssetSuggest();
  const scrollRef = useRef<HTMLDivElement>(null);

  const typeById = useMemo(() => new Map(types.map((t) => [t._id, t] as const)), [types]);

  // Snap to bottom whenever a new message or the mutation state changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, suggest.isPending]);

  async function send(prompt: string) {
    const text = prompt.trim();
    if (!text || suggest.isPending) return;
    setInput('');

    const nextMessages: LocalMessage[] = [...messages, { kind: 'user', content: text }];
    setMessages(nextMessages);

    // Build the API history from the local transcript. Errors don't go upstream.
    const history: ChatMessage[] = nextMessages
      .filter((m): m is Extract<LocalMessage, { kind: 'user' | 'assistant' }> =>
        m.kind === 'user' || m.kind === 'assistant')
      .map((m) => ({
        role: m.kind === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

    // Fresh snapshot of the current build so the LLM sees whatever the user just typed.
    const context = {
      types: types.map((t) => ({
        typeId: t._id,
        displayName: t.displayName,
        category: t.category,
        rangeKm: t.envelope.rangeKm,
        notes: t.notes ?? null,
      })),
      rows: rows
        .map((r) => ({ typeId: r.typeId, count: Number.parseInt(r.count, 10) || 0 }))
        .filter((r) => typeById.has(r.typeId)),
      crews: Number.parseInt(crewsStr, 10) || 0,
    };

    try {
      const result = await suggest.mutateAsync({ messages: history, context });
      setMessages((prev) => [
        ...prev,
        { kind: 'assistant', content: result.reply, suggestions: result.suggestions },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setMessages((prev) => [...prev, { kind: 'error', content: msg }]);
    }
  }

  function apply(suggestion: AssetSuggestion) {
    const newRows: AssetRow[] = suggestion.changes.rows
      .filter((r) => typeById.has(r.typeId) && r.count > 0)
      .map((r) => ({ typeId: r.typeId, count: String(r.count) }));
    const changes: { rows: AssetRow[]; crews?: string } = { rows: newRows };
    if (suggestion.changes.crews !== null && suggestion.changes.crews !== undefined) {
      changes.crews = String(suggestion.changes.crews);
    }
    onApplySuggestion(changes);
    setAppliedIds((prev) => new Set(prev).add(suggestion.id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const catalogEmpty = types.length === 0;
  const showIntro = messages.length === 0 && !suggest.isPending;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <Sparkles size={12} className="text-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink">AI assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {showIntro && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-muted leading-snug">
              Ask about your loadout.
            </p>
            <div className="flex flex-col gap-1">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void send(p)}
                  disabled={catalogEmpty}
                  className="text-left px-2 py-1.5 border border-line hover:border-cyan hover:text-cyan text-muted font-mono text-[10px] leading-snug disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p}
                </button>
              ))}
            </div>
            {catalogEmpty && (
              <p className="text-[10px] font-mono text-amber leading-snug">
                No asset types in this sector — chat disabled until types exist.
              </p>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.kind === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-2 py-1.5 bg-cyan/10 border border-cyan/40 font-mono text-[11px] text-ink whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            );
          }
          if (m.kind === 'error') {
            return (
              <div key={i} className="px-2 py-1.5 border border-red/40 bg-red/10 font-mono text-[10px] text-red">
                {m.content}
              </div>
            );
          }
          return (
            <div key={i} className="space-y-2">
              <div className="px-2 py-1.5 border border-line bg-bg/40 font-mono text-[11px] text-ink whitespace-pre-wrap leading-snug">
                {m.content}
              </div>
              {m.suggestions.map((s) => {
                const applied = appliedIds.has(s.id);
                return (
                  <div key={s.id} className="border border-line bg-panel px-2 py-2 space-y-1.5">
                    <div className="font-mono text-[11px] font-bold text-cyan">{s.title}</div>
                    <div className="font-mono text-[10px] text-muted leading-snug">{s.rationale}</div>
                    <div className="border-t border-line pt-1.5 space-y-0.5">
                      {s.changes.rows.length === 0 ? (
                        <div className="font-mono text-[10px] text-muted">— no launcher changes —</div>
                      ) : (
                        s.changes.rows.map((r) => {
                          const t = typeById.get(r.typeId);
                          if (!t) return null;
                          return (
                            <div key={r.typeId} className="flex items-center gap-2 font-mono text-[10px]">
                              <span className="text-ink">{t.displayName}</span>
                              <span className="text-muted">·</span>
                              <span className="text-muted">{t.category}</span>
                              <span className="ml-auto text-cyan">× {r.count}</span>
                            </div>
                          );
                        })
                      )}
                      {s.changes.crews !== null && s.changes.crews !== undefined && (
                        <div className="flex items-center gap-2 font-mono text-[10px] pt-0.5">
                          <span className="text-ink">Crews</span>
                          <span className="ml-auto text-cyan">× {s.changes.crews}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => apply(s)}
                        disabled={applied}
                        className={applied
                          ? `${buttonGhost} !text-green !border-green/60 flex items-center gap-1.5 disabled:opacity-100`
                          : `${buttonPrimary} flex items-center gap-1.5`}
                      >
                        {applied ? (<><Check size={12} /> Applied</>) : 'Apply'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {suggest.isPending && (
          <div className="flex items-center gap-2 px-2 py-1.5 font-mono text-[10px] text-muted">
            <span className="inline-block w-1 h-1 rounded-full bg-cyan animate-pulse" />
            thinking…
          </div>
        )}
      </div>

      <div className="border-t border-line p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            className={`${inputCls} flex-1 resize-none leading-snug`}
            rows={2}
            placeholder={catalogEmpty ? 'No asset types available…' : 'Ask about your loadout…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={catalogEmpty || suggest.isPending}
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={catalogEmpty || suggest.isPending || !input.trim()}
            className={`${buttonPrimary} !px-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center`}
            title="Send (Enter)"
            aria-label="Send message"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
