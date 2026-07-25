import { refreshDbFromProd } from '../lib/refreshDb.js';

/** Standalone entry point for `make refresh-db` / `npm run refresh-db`.
 *  All logic lives in ../lib/refreshDb.ts, shared with the server's boot-time refresh. */

const result = await refreshDbFromProd();
if (result.skipped) {
  console.error(`[refresh-db] skipped: ${result.reason}`);
  process.exit(1);
}
