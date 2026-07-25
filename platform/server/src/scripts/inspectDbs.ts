import { MongoClient } from 'mongodb';
import { config } from '../config.js';

const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
await client.connect();

for (const dbName of ['milfy-app', 'milfy-app-staging', 'milfy-app-dev']) {
  const db = client.db(dbName);
  const cols = (await db.listCollections().toArray()).filter((c) => c.type !== 'view');
  console.log(`\n=== ${dbName} (${cols.length} collections) ===`);
  for (const c of cols) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  ${c.name.padEnd(20)} ${count}`);
  }
}

await client.close();
