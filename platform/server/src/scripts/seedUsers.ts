import { connectDb, closeDb } from '../db.js';
import { hashPassword, type InviteRow, type Role } from '../auth/session.js';

/**
 * Seed four demo role accounts you sign in to with a username + shared password
 * (no more 20-digit codes). Each maps to a World verification level:
 *
 *   admin      — demo operator, full access (no World level; god mode)
 *   government — Orb-verified · sets rules, confirms force, releases funds
 *   military   — Passport-verified · runs engagements (downings)
 *   spotter    — Selfie-verified · files reports
 *
 * Non-destructive: upserts by username, so re-running just refreshes them.
 * Run:  npm run seed:users
 */

const PASSWORD = process.env.DEMO_PASSWORD ?? 'milfi';

/** Pre-designed accounts only — no invite codes. The military account is bound
 * to its settlement unit here, in the DB (`unitId` on the invite row), so the
 * console can show that unit's claims/wallet without any extra linking UI. */
const USERS: Array<{ username: string; role: Role; label: string; unitId?: string }> = [
  { username: 'admin', role: 'admin', label: 'Admin · demo operator' },
  { username: 'government', role: 'government', label: 'Government · Orb' },
  { username: 'military', role: 'military', label: 'Military · Passport', unitId: 'unit-alpha' },
  { username: 'spotter', role: 'spotter', label: 'Spotter · Selfie' },
];

async function main() {
  const { collections } = await connectDb();
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);

  for (const u of USERS) {
    const row: InviteRow = {
      _id: `user-${u.username}`,
      label: u.label,
      role: u.role,
      username: u.username,
      passwordHash,
      createdAt: now,
      ...(u.unitId ? { unitId: u.unitId } : {}),
    };
    await collections.invites.replaceOne({ username: u.username }, row, { upsert: true });
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Demo role accounts (shared password: "${PASSWORD}")`);
  console.log('═══════════════════════════════════════════════════════════════');
  for (const u of USERS) {
    console.log(`  ${u.username.padEnd(11)} ${PASSWORD.padEnd(8)} → role ${u.role}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Sign in at /login with username + password.');
  console.log('');

  await closeDb();
}

main().catch((err) => {
  console.error('seed:users failed', err);
  process.exit(1);
});
