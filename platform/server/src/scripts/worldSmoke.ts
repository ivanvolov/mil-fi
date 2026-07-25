import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

/**
 * Proves the Interface 1 payout-authorization verification works end to end,
 * without needing the real World signer: we mint a throwaway signer, point the
 * verifier at it, sign a sample authorization with our canonical form, and check
 * that valid passes and every tampered/expired/replayed variant is refused.
 *
 *   npm run world:smoke
 *
 * The only remaining integration risk after this is agreeing the exact canonical
 * form + signer address with the World side — the crypto path itself is verified.
 */

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  // Point the verifier at our throwaway signer BEFORE importing the module that
  // reads config (dotenv won't override an already-set env var).
  process.env.WORLD_SIGNER_ADDRESS = account.address;

  const { verifyPayoutAuthorization, canonicalAuthorization, _resetNonces } = await import(
    '../world/auth.js'
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const auth = {
    engagementId: 'eng-demo',
    amount: '25.00',
    currency: 'DEFPOINT',
    humanId: '0xhuman',
    tier: 3,
    issuedAt: nowSec,
    expiresAt: nowSec + 300,
    nonce: '0xnonce-1',
  };
  const signature = await account.signMessage({ message: canonicalAuthorization(auth) });

  const show = (label: string, r: { ok: boolean; reason?: string }) =>
    console.log(`  ${r.ok ? '✓' : '✗'} ${label.padEnd(22)} ${JSON.stringify(r)}`);

  console.log('[world:smoke] Interface 1 signature verification:');
  show('valid', await verifyPayoutAuthorization(auth, signature, 'eng-demo'));
  show('replayed nonce', await verifyPayoutAuthorization(auth, signature, 'eng-demo'));
  _resetNonces();
  show('wrong engagement', await verifyPayoutAuthorization(auth, signature, 'eng-other'));
  show(
    'tampered amount',
    await verifyPayoutAuthorization({ ...auth, amount: '9999.00' }, signature, 'eng-demo'),
  );
  const expired = { ...auth, nonce: '0xnonce-2', expiresAt: nowSec - 1 };
  const sigExpired = await account.signMessage({ message: canonicalAuthorization(expired) });
  show('expired', await verifyPayoutAuthorization(expired, sigExpired, 'eng-demo'));

  console.log(
    '\n[world:smoke] expected: valid ✓, all others ✗ (replay/mismatch/tamper/expiry). Done.',
  );
}

main().catch((err) => {
  console.error('[world:smoke] failed:', err);
  process.exit(1);
});
