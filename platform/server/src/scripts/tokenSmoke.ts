import {
  createUnitAccount,
  associateAndGrantKyc,
  payDefpoint,
  defpointBalance,
  freezeUnit,
} from '../hedera/token.js';
import { closeHedera } from '../hedera/client.js';

/**
 * Full HTS lifecycle smoke on live testnet:
 *   create unit account → associate + KYC → pay 100 DEFPOINT → read balance → freeze.
 *   npm run token:smoke
 * Proves the settle-agent's on-chain hands work end to end.
 */

async function main() {
  console.log('[token:smoke] creating a unit account…');
  const unit = await createUnitAccount();
  console.log(`  accountId=${unit.accountId}`);

  console.log('[token:smoke] associating DEFPOINT + granting KYC…');
  const kyc = await associateAndGrantKyc(unit.accountId, unit.privateKey);
  console.log(`  associateTx=${kyc.associateTx}`);
  console.log(`  kycTx=${kyc.kycTx}`);

  console.log('[token:smoke] paying 100 DEFPOINT treasury → unit…');
  const pay = await payDefpoint(unit.accountId, 100);
  console.log(`  transferTx=${pay.transferTx}`);

  // Mirror lags a beat; poll for the balance.
  let bal = 0;
  for (let i = 0; i < 8; i++) {
    bal = await defpointBalance(unit.accountId);
    if (bal > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[token:smoke] unit DEFPOINT balance = ${bal}`);

  console.log('[token:smoke] freezing the unit (dispute hold demo)…');
  const fr = await freezeUnit(unit.accountId);
  console.log(`  freezeTx=${fr.freezeTx}`);

  console.log(`\n[token:smoke] ✓ done. HashScan: https://hashscan.io/testnet/account/${unit.accountId}`);
  closeHedera();
}

main().catch((err) => {
  console.error('[token:smoke] failed:', err);
  closeHedera();
  process.exit(1);
});
