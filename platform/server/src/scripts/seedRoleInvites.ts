import crypto from 'node:crypto';
import { connectDb, closeDb } from '../db.js';
import type { InviteRow, Role } from '../auth/session.js';

/** Seed one invite code per role (admin / government / military / spotter).
 *  Non-destructive: existing invites are untouched; a role that already has an
 *  active invite is skipped. Run with `npm run seed:roles`. */

const CODE_LENGTH = 20;

function generateCode(): string {
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

const ROLE_SEED: Array<{ role: Role; label: string }> = [
  { role: 'admin', label: 'admin-1' },
  { role: 'government', label: 'gov-1' },
  { role: 'military', label: 'unit-1' },
  { role: 'spotter', label: 'spotter-1' },
];

async function main() {
  const { collections } = await connectDb();
  const now = new Date();
  const results: Array<{ label: string; role: Role; code: string; existed: boolean }> = [];

  for (const seed of ROLE_SEED) {
    const existing = await collections.invites.findOne({ role: seed.role, revoked: { $ne: true } });
    if (existing) {
      results.push({ label: existing.label, role: seed.role, code: existing._id, existed: true });
      continue;
    }
    const row: InviteRow = { _id: generateCode(), label: seed.label, role: seed.role, createdAt: now };
    await collections.invites.insertOne(row);
    results.push({ label: seed.label, role: seed.role, code: row._id, existed: false });
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Role invite codes (existing kept, missing generated):');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.role.padEnd(11)} ${r.label.padEnd(10)} ${format(r.code)}${r.existed ? '  (existing)' : '  (new)'}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  await closeDb();
}

main().catch((err) => {
  console.error('seed:roles failed', err);
  process.exit(1);
});
