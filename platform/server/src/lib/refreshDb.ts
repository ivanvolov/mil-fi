import { MongoClient } from 'mongodb';
import { config } from '../config.js';

/** Drops the target DB and copies every collection from source into it.
 *
 *  Called two ways:
 *    - Boot-time on staging: `refreshFromProdIfStaging()` is invoked in server/src/index.ts
 *      when NODE_ENV=production && MONGODB_DB ends in `-staging`. Bypasses Render's
 *      preDeployCommand entirely — always runs, right before Fastify starts.
 *    - Manual local via `make refresh-db` → `server/src/scripts/refreshStagingDb.ts`.
 *
 *  Guardrails: target must end with `-staging` or `-dev`; source != target.
 *  Indexes are NOT copied — Fastify's boot re-runs ensureIndexes() in db.ts. */

export type RefreshResult = {
  skipped?: 'not-staging' | 'guard-failed';
  reason?: string;
  collections?: Record<string, number>;
  sourceDb?: string;
  targetDb?: string;
};

const SOURCE_DEFAULT = 'milfy-app';

/** Collections that belong to the *target* env and must NOT be touched by the refresh.
 *  `sessions` holds live logins keyed by a cookie signed with the target's SESSION_SECRET;
 *  dropping them (or copying prod's over them) logs every staging tester out on each deploy.
 *  These are neither dropped nor copied — the refresh leaves them exactly as they are. */
const PRESERVE_TARGET_COLLECTIONS = new Set(['sessions']);

export async function refreshDbFromProd(opts?: { sourceDb?: string; targetDb?: string }): Promise<RefreshResult> {
  const sourceDb = opts?.sourceDb ?? process.env.REFRESH_SOURCE_DB ?? SOURCE_DEFAULT;
  const targetDb = opts?.targetDb ?? config.mongoDb;

  if (!targetDb.endsWith('-staging') && !targetDb.endsWith('-dev')) {
    return { skipped: 'guard-failed', reason: `target "${targetDb}" doesn't end with -staging or -dev` };
  }
  if (sourceDb === targetDb) {
    return { skipped: 'guard-failed', reason: `source and target are the same (${sourceDb})` };
  }

  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const source = client.db(sourceDb);
    const target = client.db(targetDb);

    const sourceCollections = (await source.listCollections().toArray()).filter((c) => c.type !== 'view');
    const targetCollections = (await target.listCollections().toArray()).filter((c) => c.type !== 'view');
    console.log(`[refresh-db] source=${sourceDb} target=${targetDb} collections=${sourceCollections.length}`);

    // We deliberately do NOT drop the whole database — that would take the preserved
    // collections (live logins) with it. Instead we drop only the collections we're
    // about to re-copy, plus any target collection that no longer exists in prod. The
    // preserved set (`sessions`) is never dropped, copied over, or otherwise touched.
    const sourceNames = new Set(sourceCollections.map((c) => c.name));
    for (const c of targetCollections) {
      if (PRESERVE_TARGET_COLLECTIONS.has(c.name)) continue;
      await target.collection(c.name).drop().catch(() => { /* NamespaceNotFound — ignore */ });
    }

    const counts: Record<string, number> = {};
    for (const c of sourceCollections) {
      const name = c.name;
      // Never overwrite a preserved, target-owned collection with prod's copy.
      if (PRESERVE_TARGET_COLLECTIONS.has(name)) continue;
      const docs = await source.collection(name).find({}).toArray();
      if (docs.length > 0) {
        await target.collection(name).insertMany(docs);
      }
      counts[name] = docs.length;
      console.log(`[refresh-db]   ${name}: ${docs.length}`);
    }

    // Report the preserved (untouched) collections for visibility.
    for (const name of PRESERVE_TARGET_COLLECTIONS) {
      if (sourceNames.has(name)) {
        console.log(`[refresh-db]   ${name}: preserved (prod copy skipped)`);
      } else {
        console.log(`[refresh-db]   ${name}: preserved (untouched)`);
      }
    }

    console.log('[refresh-db] done');
    return { collections: counts, sourceDb, targetDb };
  } finally {
    await client.close();
  }
}

/** Boot-time guard: only refresh when we're a production deploy of the staging service.
 *  Local dev (NODE_ENV=development) or prod service (targetDb=milfy-app) both no-op. */
export async function refreshFromProdIfStaging(): Promise<RefreshResult> {
  if (!config.isProd) {
    return { skipped: 'not-staging', reason: 'NODE_ENV != production' };
  }
  if (!config.mongoDb.endsWith('-staging')) {
    return { skipped: 'not-staging', reason: `MONGODB_DB "${config.mongoDb}" isn't a staging DB` };
  }
  return refreshDbFromProd();
}
