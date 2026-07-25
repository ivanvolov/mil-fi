import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { runAgentA, runAgentB } from '../verification/agents.js';

/**
 * Smoke test for the server-side vision agents against the real fixtures.
 *   npm run verify:smoke -- <pre-strike.jpg> [post-strike.jpg]
 * Defaults to the verification/ fixtures (drone2 = threat in flight, drone = wreckage).
 */

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function toBase64(path: string): { base64: string; mime: string } {
  const abs = resolve(path);
  return {
    base64: readFileSync(abs).toString('base64'),
    mime: MIME[extname(abs).toLowerCase()] ?? 'image/jpeg',
  };
}

async function main() {
  const preArg = process.argv[2] ?? '../../verification/fixtures/drone2.jpg';
  const postArg = process.argv[3] ?? '../../verification/fixtures/drone.jpg';

  console.log(`[verify:smoke] Agent A on ${preArg}…`);
  const a = await runAgentA(toBase64(preArg));
  console.log(`  requestId=${a.requestId} model=${a.model} latency=${a.latencyMs}ms hash=${a.imageHash}`);
  console.log('  verdict:', JSON.stringify(a.verdict));

  console.log(`\n[verify:smoke] Agent B on ${postArg} (given Agent A's verdict)…`);
  const b = await runAgentB(toBase64(postArg), a.verdict);
  console.log(`  requestId=${b.requestId} model=${b.model} latency=${b.latencyMs}ms hash=${b.imageHash}`);
  console.log('  verdict:', JSON.stringify(b.verdict));
}

main().catch((err) => {
  console.error('[verify:smoke] failed:', err);
  process.exit(1);
});
