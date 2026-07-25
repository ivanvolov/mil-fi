import { evidence, submitEvidence, readJournal, forEngagement } from '../hedera/journal.js';
import { closeHedera } from '../hedera/client.js';

/**
 * End-to-end journal smoke test: append one evidence record to the HCS topic,
 * then read the topic back through the Mirror Node and show our entry.
 *
 *   npm run hedera:smoke
 *
 * Proves the write path (SDK submit) and the read path (Mirror REST) both work
 * against the live testnet topic. Safe to run repeatedly; each run appends one
 * throwaway record under a unique engagement id derived from the current time.
 */

async function main() {
  const engagementId = `smoke-${Date.now()}`;
  console.log(`[hedera:smoke] submitting test verdict for ${engagementId}…`);

  const rec = evidence('verdict_a', engagementId, {
    imageHash: 'sha256:demo-a3f9c2',
    classification: 'shahed_class',
    is_threat: true,
    confidence: 0.97,
    note: 'smoke test — not a real engagement',
  });

  const receipt = await submitEvidence(rec);
  console.log('[hedera:smoke] submit receipt:', receipt);
  if (!receipt.ok) {
    console.error('[hedera:smoke] submit failed — check HEDERA_* in .env');
    closeHedera();
    process.exit(1);
  }

  // Mirror Node ingests a beat behind consensus; poll briefly for our entry.
  console.log('[hedera:smoke] reading journal back via Mirror Node…');
  let mine: Awaited<ReturnType<typeof readJournal>> = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    const all = await readJournal({ limit: 100 });
    mine = forEngagement(all, engagementId);
    if (mine.length > 0) {
      console.log(`[hedera:smoke] found after ${attempt} poll(s) — topic holds ${all.length} message(s) total`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (mine.length === 0) {
    console.error('[hedera:smoke] not visible on Mirror Node yet (it can lag a few seconds). Try again.');
  } else {
    console.log('[hedera:smoke] ✓ round-trip ok:', JSON.stringify(mine, null, 2));
  }
  closeHedera();
}

main().catch((err) => {
  console.error('[hedera:smoke] failed:', err);
  closeHedera();
  process.exit(1);
});
