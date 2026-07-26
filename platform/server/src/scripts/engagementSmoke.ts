import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { connectDb, closeDb } from '../db.js';
import { onboardUnit, runEngagement } from '../services/engagement.js';
import { closeHedera } from '../hedera/client.js';
import type { SettlementRule } from '../hedera/settle.js';

/**
 * End-to-end pipeline smoke against live 0G + Hedera:
 *   1. onboard a human-backed military unit → real KYC'd Hedera account
 *   2. run an engagement (report=drone2, post=drone) → Agent A, Agent B, journal,
 *      settle-agent pays DEFPOINT
 *   3. onboard a bot (no World proof) → run → settle-agent REJECTS
 *
 *   npm run engagement:smoke
 */

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function img(path: string) {
  const abs = resolve(path);
  return { base64: readFileSync(abs).toString('base64'), mime: MIME[extname(abs).toLowerCase()] ?? 'image/jpeg' };
}

// Demo rule: confirmed threat + confirmed destruction pays. Consistency relaxed
// because the two stock fixtures aren't a true matched pre/post pair.
const DEMO_RULE: SettlementRule = {
  minThreatConfidence: 0.8,
  requireDestroyed: true,
  minDestroyedConfidence: 0.75,
  requireConsistent: false,
  payout: 100,
};

async function main() {
  const { collections } = await connectDb();
  const report = img('../../verification/fixtures/drone2.jpg');
  const post = img('../../verification/fixtures/drone.jpg');

  console.log('=== 1. human-backed military unit ===');
  const human = await onboardUnit(collections, {
    humanBackingLevel: 'military',
    worldProof: { demo: true, note: 'demo-mode fallback' },
    // Real World identity → run flow pulls a signed authorization from World.
    worldNullifier: '0xhumanNullifierDemo',
    worldTier: 3,
  });
  console.log(`  unit=${human._id} account=${human.hederaAccountId} humanBacked=${human.humanBacked}`);

  const eng1 = await runEngagement(collections, {
    unitId: human._id,
    reportImage: report,
    postImage: post,
    coords: { lat: 50.45, lon: 30.52 },
    rule: DEMO_RULE,
  });
  console.log(`  engagement=${eng1._id}`);
  console.log(`  A: ${eng1.agentA.verdict.classification} (${eng1.agentA.verdict.confidence}) req=${eng1.agentA.requestId}`);
  console.log(`  B: destroyed=${eng1.agentB.verdict.destroyed} (${eng1.agentB.verdict.confidence}) req=${eng1.agentB.requestId}`);
  console.log(`  SETTLE: ${eng1.settlement.outcome} — ${eng1.settlement.reason}`);
  console.log(`  payout=${eng1.settlement.payout} txId=${eng1.settlement.txId} journalSeq=${eng1.settlement.journal.sequenceNumber}`);

  console.log('\n=== 2. bot (no human backing) — negative scenario ===');
  const bot = await onboardUnit(collections, { humanBackingLevel: 'spotter' }); // no worldProof
  console.log(`  unit=${bot._id} account=${bot.hederaAccountId} humanBacked=${bot.humanBacked}`);
  const eng2 = await runEngagement(collections, {
    unitId: bot._id,
    reportImage: report,
    postImage: post,
    rule: DEMO_RULE,
  });
  console.log(`  SETTLE: ${eng2.settlement.outcome} — ${eng2.settlement.reason}`);

  console.log('\n✓ pipeline smoke complete.');
  closeHedera();
  await closeDb();
}

main().catch(async (err) => {
  console.error('[engagement:smoke] failed:', err);
  closeHedera();
  await closeDb();
  process.exit(1);
});
