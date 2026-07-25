import crypto from 'node:crypto';
import { connectDb, closeDb } from '../db.js';
import type { InviteRow } from '../auth/session.js';

const CODE_LENGTH = 20;
const HOW_MANY = 10;

function generateCode(): string {
  // 20 random digits. Each digit takes ~3.32 bits → use rejection sampling on
  // bytes to avoid modulo bias (an unbiased "give me digits 0-9" source).
  let out = '';
  while (out.length < CODE_LENGTH) {
    const buf = crypto.randomBytes(CODE_LENGTH);
    for (const b of buf) {
      if (b < 250) {
        out += (b % 10).toString();
        if (out.length === CODE_LENGTH) break;
      }
    }
  }
  return out;
}

function format(code: string): string {
  return code.match(/.{1,4}/g)!.join('-');
}

async function main() {
  const force = process.argv.includes('--force');
  const { collections } = await connectDb();

  const existing = await collections.invites.countDocuments();
  if (existing > 0 && !force) {
    console.error(`[seed:invites] ${existing} invites already exist. Pass --force to wipe and regenerate.`);
    await closeDb();
    process.exit(1);
  }
  if (force && existing > 0) {
    const del = await collections.invites.deleteMany({});
    const sdel = await collections.sessions.deleteMany({});
    console.error(`[seed:invites] --force: removed ${del.deletedCount} invites, ${sdel.deletedCount} sessions`);
  }

  const now = new Date();
  const rows: InviteRow[] = [];
  const seen = new Set<string>();
  while (rows.length < HOW_MANY) {
    const code = generateCode();
    if (seen.has(code)) continue;
    seen.add(code);
    rows.push({ _id: code, label: `user-${rows.length + 1}`, createdAt: now });
  }

  await collections.invites.insertMany(rows);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ${HOW_MANY} invite codes generated. Each is 20 digits.`);
  console.log('  Hand one to each user. They paste it on /login.');
  console.log('  Each code is reusable; if revoked, delete its row from `invites`.');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(8)}  ${format(r._id)}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  await closeDb();
}

main().catch((err) => {
  console.error('seed:invites failed', err);
  process.exit(1);
});
