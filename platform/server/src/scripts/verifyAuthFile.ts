import { readFileSync } from 'node:fs';
import { verifyPayoutAuthorization } from '../world/auth.js';

/**
 * Verify a payout authorization JSON produced by the World mini-app's
 * /api/authorize-payout, proving the two apps' signing/verification agree.
 *   WORLD_SIGNER_ADDRESS=0x… tsx src/scripts/verifyAuthFile.ts <file.json>
 * The file is the mini-app response: { authorized, authorization, signature }.
 */
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('usage: verifyAuthFile.ts <authorization.json>');
  const body = JSON.parse(readFileSync(path, 'utf8')) as {
    authorization: { engagementId: string } & Record<string, unknown>;
    signature: string;
  };
  const res = await verifyPayoutAuthorization(
    body.authorization as never,
    body.signature,
    body.authorization.engagementId,
  );
  console.log('[verifyAuthFile] result:', JSON.stringify(res));
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[verifyAuthFile] failed:', err);
  process.exit(1);
});
