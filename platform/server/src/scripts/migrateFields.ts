import { connectDb, closeDb } from '../db.js';
import { runFieldMigrations } from '../lib/migrateFields.js';

/** One-off, idempotent field migration for the target DB (`MONGODB_DB`). Run with:
 *    npm run migrate:fields          (in server/)
 *
 *  The same logic also runs automatically at server boot, so this is mostly for
 *  running the migration on demand (e.g. against prod) without a deploy. */

async function main() {
  const { collections, db } = await connectDb();
  console.log(`[migrate:fields] target DB: ${db.databaseName}`);
  const counts = await runFieldMigrations(collections);
  console.log(`[migrate:fields] ${JSON.stringify(counts)}`);
  console.log('[migrate:fields] done');
  await closeDb();
}

main().catch(async (err) => {
  console.error('[migrate:fields] failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
