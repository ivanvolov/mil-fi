import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';

/**
 * The two vision agents, running on 0G Compute (OpenAI-compatible router).
 *
 *   Agent A — "is this a threat?"  runs on the report image (object in the sky).
 *   Agent B — "was it destroyed?"  runs on the post-strike image, and is told
 *             what Agent A saw so it can judge consistency.
 *
 * Both return strict JSON. We also capture the router's request id and usage so
 * the submission has proof the inference actually ran on 0G (not a local model
 * or OpenAI with a 0G sticker on it).
 *
 * No image bytes are stored here — we hash the image (sha256) and that hash is
 * what goes into the Hedera journal. The raw image stays in the caller's DB.
 */

// --- image input ------------------------------------------------------------

export type ImageInput =
  | { dataUrl: string } // data:image/...;base64,....
  | { base64: string; mime?: string }
  | { url: string }; // remote http(s) image the router can fetch

function isDataUrl(u: string): boolean {
  return /^data:.*;base64,/.test(u);
}

/** Resolve any ImageInput into { imageUrl, imageHash }. imageHash is sha256 of
 * the raw bytes when we have them (data/base64), else of the URL string. */
async function resolveImage(input: ImageInput): Promise<{ imageUrl: string; imageHash: string }> {
  if ('dataUrl' in input) {
    const b64 = input.dataUrl.split(',')[1] ?? '';
    return { imageUrl: input.dataUrl, imageHash: sha256(Buffer.from(b64, 'base64')) };
  }
  if ('base64' in input) {
    const mime = input.mime ?? 'image/jpeg';
    return {
      imageUrl: `data:${mime};base64,${input.base64}`,
      imageHash: sha256(Buffer.from(input.base64, 'base64')),
    };
  }
  // Remote URL: hash the URL (we don't fetch bytes server-side; the router does).
  return { imageUrl: input.url, imageHash: sha256(Buffer.from(input.url, 'utf8')) };
}

function sha256(buf: Buffer): string {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

// --- verdict schemas --------------------------------------------------------

export const AgentAVerdict = z.object({
  is_threat: z.boolean(),
  classification: z.enum(['shahed_class', 'other_uav', 'aircraft', 'not_a_threat', 'unclear']),
  objects_seen: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type AgentAVerdict = z.infer<typeof AgentAVerdict>;

export const AgentBVerdict = z.object({
  destroyed: z.boolean(),
  evidence_type: z.enum(['wreckage', 'thermal_detonation', 'empty_sky', 'inconclusive']),
  consistent_with_prior: z.boolean(),
  objects_seen: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type AgentBVerdict = z.infer<typeof AgentBVerdict>;

// --- prompts ----------------------------------------------------------------

const SYSTEM_A = `You are Agent A, a counter-UAV threat-identification agent.
You analyze a single visual-spectrum image from an air-defense engagement.
Respond with STRICT JSON only, no markdown fences, matching:
{
  "is_threat": boolean,
  "classification": "shahed_class" | "other_uav" | "aircraft" | "not_a_threat" | "unclear",
  "objects_seen": string[],
  "confidence": number,   // 0..1
  "reasoning": string     // one or two sentences
}`;

const SYSTEM_B = `You are Agent B, a battle-damage-assessment agent.
You analyze a single post-strike image and judge whether the target was destroyed.
You are given what Agent A reported about the pre-strike image; use it only to judge
consistency (same object class, plausible outcome), never to override what you see.
Respond with STRICT JSON only, no markdown fences, matching:
{
  "destroyed": boolean,
  "evidence_type": "wreckage" | "thermal_detonation" | "empty_sky" | "inconclusive",
  "consistent_with_prior": boolean,
  "objects_seen": string[],
  "confidence": number,   // 0..1
  "reasoning": string     // one or two sentences
}`;

// --- 0G call ----------------------------------------------------------------

export interface AgentRun<V> {
  verdict: V;
  raw: string;
  model: string;
  /** 0G router request id — proof-of-inference artifact. */
  requestId?: string;
  usage?: unknown;
  latencyMs: number;
  imageHash: string;
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in model output');
  return JSON.parse(match[0]);
}

async function callRouter(
  systemPrompt: string,
  userText: string,
  imageUrl: string,
): Promise<{ content: string; requestId?: string; usage?: unknown; latencyMs: number }> {
  const { baseUrl, apiKey, model } = config.zerog;
  if (!apiKey) throw new Error('0G router key missing (set ZG_ROUTER_API_KEY or OG_API_KEY)');

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 500,
  };

  const t0 = performance.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const latencyMs = Math.round(performance.now() - t0);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`0G router ${res.status} ${res.statusText}: ${errText.slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = body.choices?.[0]?.message?.content ?? '';
  return { content, requestId: body.id, usage: body.usage, latencyMs };
}

export async function runAgentA(image: ImageInput): Promise<AgentRun<AgentAVerdict>> {
  const { imageUrl, imageHash } = await resolveImage(image);
  const { content, requestId, usage, latencyMs } = await callRouter(
    SYSTEM_A,
    'Analyze this image. Identify any aerial objects and classify the threat.',
    imageUrl,
  );
  const verdict = AgentAVerdict.parse(extractJson(content));
  return { verdict, raw: content, model: config.zerog.model, requestId, usage, latencyMs, imageHash };
}

export async function runAgentB(
  image: ImageInput,
  priorA: AgentAVerdict,
): Promise<AgentRun<AgentBVerdict>> {
  const { imageUrl, imageHash } = await resolveImage(image);
  const priorSummary = `Agent A reported: classification=${priorA.classification}, is_threat=${priorA.is_threat}, confidence=${priorA.confidence}, objects=${priorA.objects_seen.join('/')}.`;
  const { content, requestId, usage, latencyMs } = await callRouter(
    SYSTEM_B,
    `This is the post-strike image for that engagement. ${priorSummary} Judge whether the target was destroyed and whether the outcome is consistent with Agent A.`,
    imageUrl,
  );
  const verdict = AgentBVerdict.parse(extractJson(content));
  return { verdict, raw: content, model: config.zerog.model, requestId, usage, latencyMs, imageHash };
}
