/** Read-only backup: dumps every non-deleted layer + its 5 child collections
 *  (interceptors, threats, teams, threads, drawings) to JSON files under
 *  backups/<YYYY-MM-DD>/<slug>.json. EJSON preserves ObjectId and Date types
 *  so a restore script can round-trip them cleanly.
 *
 *  Restore (not built yet): when needed, write a paired script that reads
 *  one JSON, mints fresh _ids for the layer + every child, builds an
 *  interceptor-id and team-id remap table (so threads stay consistent), and
 *  inserts. The duplicate handler in `server/src/routes/layers.ts` is the
 *  reference implementation.
 */
import { MongoClient, type Document } from 'mongodb';
import { EJSON } from 'bson';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const uri = config.mongoUri;
const dbName = config.mongoDb;

const CHILD_COLLECTIONS = [
  'interceptors',
  'threats',
  'teams',
  'threads',
  'drawings',
] as const;

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const layers = await db.collection('layers').find({ deletedAt: null }).toArray();

    if (layers.length === 0) {
      console.log('no layers to back up');
      return;
    }

    // repo root = two dirs up from server/src/scripts/
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const outDir = resolve(repoRoot, 'backups', todayStamp());
    await mkdir(outDir, { recursive: true });

    const index: Array<{
      slug: string;
      name: string;
      _id: string;
      counts: Record<string, number>;
      file: string;
    }> = [];

    for (const layer of layers) {
      const layerId = layer._id;
      const childArrays = await Promise.all(
        CHILD_COLLECTIONS.map((name) =>
          db.collection(name).find({ layerId, deletedAt: null }).toArray(),
        ),
      );

      const children: Record<string, Document[]> = {};
      const counts: Record<string, number> = {};
      CHILD_COLLECTIONS.forEach((name, i) => {
        const arr = childArrays[i] ?? [];
        children[name] = arr;
        counts[name] = arr.length;
      });

      const dump = {
        exportedAt: new Date().toISOString(),
        sourceDb: dbName,
        layer,
        ...children,
      };

      const file = `${layer.slug}.json`;
      const filePath = resolve(outDir, file);
      await writeFile(filePath, EJSON.stringify(dump, undefined, 2));

      index.push({
        slug: String(layer.slug),
        name: String(layer.name),
        _id: String(layer._id),
        counts,
        file,
      });

      const summary = CHILD_COLLECTIONS.map((n) => `${counts[n]} ${n}`).join(', ');
      console.log(`✓ ${layer.slug} — ${summary}`);
    }

    await writeFile(
      resolve(outDir, 'INDEX.json'),
      JSON.stringify({ exportedAt: new Date().toISOString(), sourceDb: dbName, sectors: index }, null, 2),
    );

    console.log(`\nbackup written to ${outDir}`);
    console.log(`${layers.length} sector(s) dumped`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
