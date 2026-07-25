import { z } from 'zod';

export const ChatRole = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  role: ChatRole,
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const AssetSuggestContextType = z.object({
  typeId: z.string().min(1),
  displayName: z.string().min(1),
  category: z.enum(['interceptor', 'mfg', 'manpads']),
  rangeKm: z.number(),
  notes: z.string().nullable(),
});

export const AssetSuggestContextRow = z.object({
  typeId: z.string().min(1),
  count: z.number().int().min(0).max(100),
});

export const AssetSuggestContext = z.object({
  types: z.array(AssetSuggestContextType).min(1).max(50),
  rows: z.array(AssetSuggestContextRow).max(50),
  crews: z.number().int().min(0).max(100),
});
export type AssetSuggestContext = z.infer<typeof AssetSuggestContext>;

export const AssetSuggestRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(20),
  context: AssetSuggestContext,
});
export type AssetSuggestRequest = z.infer<typeof AssetSuggestRequest>;

export const AssetSuggestionRow = z.object({
  typeId: z.string().min(1),
  count: z.number().int().min(0).max(100),
});

export const AssetSuggestion = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
  changes: z.object({
    rows: z.array(AssetSuggestionRow).max(20),
    crews: z.number().int().min(0).max(100).nullable(),
  }),
});
export type AssetSuggestion = z.infer<typeof AssetSuggestion>;

export const AssetSuggestResponse = z.object({
  reply: z.string().max(2000),
  suggestions: z.array(AssetSuggestion).max(3),
});
export type AssetSuggestResponse = z.infer<typeof AssetSuggestResponse>;
