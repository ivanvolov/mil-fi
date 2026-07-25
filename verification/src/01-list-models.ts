import { BASE_URL, authHeaders } from "./config.js";

interface ModelEntry {
  id: string;
  [k: string]: unknown;
}

const VISION_HINTS = /vl|vision|omni|image|multimodal/i;

const res = await fetch(`${BASE_URL}/models`, { headers: authHeaders() });
if (!res.ok) {
  console.error(`GET ${BASE_URL}/models → ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const body = (await res.json()) as { data?: ModelEntry[] } | ModelEntry[];
const models = Array.isArray(body) ? body : (body.data ?? []);

console.log(`Router: ${BASE_URL}`);
console.log(`Models: ${models.length}\n`);

for (const m of models) {
  const visionByName = VISION_HINTS.test(m.id);
  const meta = JSON.stringify(
    Object.fromEntries(
      Object.entries(m).filter(([k]) => !["id", "object"].includes(k))
    )
  );
  console.log(`${visionByName ? "👁  " : "   "}${m.id}`);
  if (meta !== "{}") console.log(`     ${meta}`);
}

const vision = models.filter((m) => VISION_HINTS.test(m.id));
console.log(
  `\nVision-capable by name heuristic: ${
    vision.length ? vision.map((m) => m.id).join(", ") : "none found"
  }`
);
