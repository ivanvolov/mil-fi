import type { FastifyInstance } from 'fastify';
import type { Collections } from '../db.js';
import {
  AssetSuggestRequest,
  AssetSuggestResponse,
  type AssetSuggestContext,
} from '@shared/schemas/ai-asset-suggest';
import {
  OrchestrationSummaryRequest,
  OrchestrationSummaryResponse,
} from '@shared/schemas/ai-orchestration-summary';
import { HttpError } from '../lib/crud.js';
import { config } from '../config.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

function buildSystemPrompt(ctx: AssetSuggestContext): string {
  const catalog = ctx.types
    .map((t) => {
      const notes = t.notes ? ` — ${t.notes.replace(/\s+/g, ' ').slice(0, 200)}` : '';
      return `- ${t.typeId} | ${t.displayName} | ${t.category} | ${t.rangeKm}km${notes}`;
    })
    .join('\n');

  const currentBuild = ctx.rows.length
    ? ctx.rows.map((r) => `${r.typeId}×${r.count}`).join(', ')
    : '(empty)';

  return [
    'You are an air-defense loadout assistant embedded in a sector planning tool.',
    'The operator is choosing which launchers and crews to bring to a sector.',
    '',
    'AVAILABLE ASSET CATALOG (typeId | name | category | max range):',
    catalog,
    '',
    `CURRENT BUILD: launchers = ${currentBuild}, crews = ${ctx.crews}.`,
    '',
    'Rules:',
    '1. Respond conversationally in `reply` (2-4 short sentences).',
    '2. When the operator asks for a change or recommendation, produce 1-3 concrete `suggestions`.',
    '   Each suggestion is a complete replacement loadout (not a diff).',
    '3. NEVER invent a typeId. Only use typeIds from the AVAILABLE ASSET CATALOG above.',
    '4. If the operator asks something off-topic or purely informational, reply briefly with 0 suggestions.',
    '5. Keep `title` under 60 chars, `rationale` under 300 chars.',
    '6. Set `changes.crews` to a number only if you are explicitly recommending a crew count change; otherwise use null.',
    '7. Prefer preserving the operator\'s intent (their previous handles, ranges, categories) unless they explicitly want a different mix.',
  ].join('\n');
}

function buildJsonSchema(typeIds: string[]) {
  return {
    name: 'asset_suggest_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string', maxLength: 2000 },
        suggestions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              title: { type: 'string', maxLength: 120 },
              rationale: { type: 'string', maxLength: 500 },
              changes: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  rows: {
                    type: 'array',
                    maxItems: 20,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        typeId: { type: 'string', enum: typeIds },
                        count: { type: 'integer', minimum: 0, maximum: 100 },
                      },
                      required: ['typeId', 'count'],
                    },
                  },
                  crews: {
                    type: ['integer', 'null'],
                    minimum: 0,
                    maximum: 100,
                  },
                },
                required: ['rows', 'crews'],
              },
            },
            required: ['id', 'title', 'rationale', 'changes'],
          },
        },
      },
      required: ['reply', 'suggestions'],
    },
  };
}

// Note: `collections` is unused today (AI proxy has no DB writes) but kept
// in the signature so registration matches every other route module.
export async function registerAiRoutes(app: FastifyInstance, _c: Collections) {
  app.post<{ Body: unknown }>('/ai/asset-suggest', async (req) => {
    const body = AssetSuggestRequest.parse(req.body);
    const apiKey = config.openaiApiKey;
    if (!apiKey) {
      throw new HttpError(500, 'AI_NOT_CONFIGURED', 'OPENAI_API_KEY is not set on the server');
    }

    const typeIds = body.context.types.map((t) => t.typeId);
    if (typeIds.length === 0) {
      throw new HttpError(400, 'NO_TYPES', 'no asset types provided in context');
    }

    const systemPrompt = buildSystemPrompt(body.context);
    const openAiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: openAiMessages,
        max_tokens: 800,
        temperature: 0.4,
        response_format: {
          type: 'json_schema',
          json_schema: buildJsonSchema(typeIds),
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      app.log.error({ status: upstream.status, body: errText }, 'openai upstream error');
      throw new HttpError(
        502,
        'AI_UPSTREAM',
        `OpenAI request failed (${upstream.status})`,
      );
    }

    const raw = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = raw.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, 'AI_EMPTY', 'OpenAI returned an empty response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpError(502, 'AI_BAD_JSON', 'OpenAI returned non-JSON content');
    }

    const validated = AssetSuggestResponse.parse(parsed);
    // Belt-and-suspenders: drop any suggestion rows whose typeId isn't in the
    // catalog. The strict json_schema enum should already prevent this, but if
    // OpenAI ever bypasses it we still want to refuse to surface junk ids.
    const validTypeIds = new Set(typeIds);
    validated.suggestions = validated.suggestions.map((s) => ({
      ...s,
      changes: {
        ...s.changes,
        rows: s.changes.rows.filter((r) => validTypeIds.has(r.typeId)),
      },
    }));

    return validated;
  });

  app.post<{ Body: unknown }>('/ai/orchestration-summary', async (req) => {
    const body = OrchestrationSummaryRequest.parse(req.body);
    const apiKey = config.openaiApiKey;
    if (!apiKey) {
      throw new HttpError(500, 'AI_NOT_CONFIGURED', 'OPENAI_API_KEY is not set on the server');
    }

    const critList = body.critical.length === 0
      ? '(none)'
      : body.critical.map((c) => `- ${c.code}: ${c.reason}`).join('\n');
    const systemPrompt = [
      'You are an air-defense readout assistant embedded in a control-tower orchestration panel.',
      'Produce ONE terse ops-room summary (max 220 chars). Lowercase, clinical tone. No emojis, no markdown, no headings.',
      'Use middle-dot (·) as separator when helpful. Reference threat codes verbatim (e.g. T-1).',
      'If no criticals: brief reassurance (e.g. "all threats covered; continue monitoring").',
      'If criticals: name the codes, cluster their reasons, end with one actionable nudge (e.g. "deploy backup for T-1, T-3" or "MFG gap on T-2, T-5").',
      '',
      `CONTEXT: ${body.threatCount} threats, ${body.assignmentCount} assignments.`,
      'CRITICAL THREATS:',
      critList,
    ].join('\n');

    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the summary now.' },
        ],
        max_tokens: 200,
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'orchestration_summary',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { summary: { type: 'string', maxLength: 400 } },
              required: ['summary'],
            },
          },
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      app.log.error({ status: upstream.status, body: errText }, 'openai upstream error (summary)');
      throw new HttpError(502, 'AI_UPSTREAM', `OpenAI request failed (${upstream.status})`);
    }
    const raw = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = raw.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, 'AI_EMPTY', 'OpenAI returned an empty response');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpError(502, 'AI_BAD_JSON', 'OpenAI returned non-JSON content');
    }
    return OrchestrationSummaryResponse.parse(parsed);
  });
}
