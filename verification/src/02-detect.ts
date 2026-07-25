import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { BASE_URL, MODEL, authHeaders } from "./config.js";

// Usage: tsx src/02-detect.ts --image fixtures/drone.jpg [--model <id>] [--prompt "<override>"]

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const imagePath = arg("image");
if (!imagePath) {
  console.error("Usage: tsx src/02-detect.ts --image <path> [--model <id>]");
  process.exit(1);
}
const model = arg("model") ?? MODEL;
if (!model) {
  console.error("No model: pass --model <id> or set ZG_MODEL (see `npm run models`).");
  process.exit(1);
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const abs = resolve(imagePath);
const mime = MIME[extname(abs).toLowerCase()] ?? "image/jpeg";
const dataUrl = `data:${mime};base64,${readFileSync(abs).toString("base64")}`;

const SYSTEM_PROMPT = `You are Agent A, a counter-UAV threat-identification agent.
You analyze a single visual-spectrum image from an air-defense engagement.
Respond with STRICT JSON only, no markdown fences, matching:
{
  "is_threat": boolean,
  "classification": "shahed_class" | "other_uav" | "aircraft" | "not_a_threat" | "unclear",
  "objects_seen": string[],
  "confidence": number,   // 0..1
  "reasoning": string     // one or two sentences
}`;

const userPrompt =
  arg("prompt") ??
  "Analyze this image. Identify any aerial objects and classify the threat.";

const payload = {
  model,
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
  temperature: 0,
  max_tokens: 500,
};

console.log(`Router: ${BASE_URL}`);
console.log(`Model:  ${model}`);
console.log(`Image:  ${abs} (${Math.round(dataUrl.length / 1024)} KB as data URL)\n`);

const t0 = performance.now();
const res = await fetch(`${BASE_URL}/chat/completions`, {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify(payload),
});
const latencyMs = Math.round(performance.now() - t0);

if (!res.ok) {
  console.error(`POST /chat/completions → ${res.status} ${res.statusText} (${latencyMs}ms)`);
  console.error(await res.text());
  process.exit(1);
}

const body = (await res.json()) as {
  choices?: { message?: { content?: string } }[];
  usage?: unknown;
};
const content = body.choices?.[0]?.message?.content ?? "";

console.log(`Latency: ${latencyMs}ms`);
console.log(`Usage:   ${JSON.stringify(body.usage ?? {})}\n`);
console.log("--- raw model output ---");
console.log(content);

// Tolerate fenced or prefixed output when extracting the verdict JSON.
const match = content.match(/\{[\s\S]*\}/);
if (match) {
  try {
    const verdict = JSON.parse(match[0]);
    console.log("\n--- parsed verdict ---");
    console.log(JSON.stringify(verdict, null, 2));
  } catch {
    console.log("\n(could not parse JSON from output)");
  }
} else {
  console.log("\n(no JSON object found in output)");
}
