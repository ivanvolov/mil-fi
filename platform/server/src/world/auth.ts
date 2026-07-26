import { verifyMessage } from 'viem';
import { config, worldAuthEnabled } from '../config.js';

/**
 * Interface 1 — payout authorization (docs/04-integration-contract.md).
 *
 * The World side issues a signed authorization proving the requesting agent is
 * human-backed AND that the operator's tier permits releasing funds. Our
 * payment agent must verify that signature before moving any DEFPOINT — an
 * unverified authorization is "decorative".
 *
 * We verify three things, all locally, no call back to World:
 *   1. signature recovers to the published World signer address (EIP-191);
 *   2. the authorization hasn't expired (5-minute window);
 *   3. the nonce hasn't been used before (single-use, replay defence).
 *
 * The bot / negative case falls out naturally: a bot never gets an authorization
 * from World, so there's nothing valid to present, and the payment is refused.
 */

export interface PayoutAuthorization {
  engagementId: string;
  amount: string;
  currency: string;
  humanId: string;
  tier: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

/**
 * Canonical serialization that the signature is computed over. Keys sorted
 * lexicographically, no insignificant whitespace. BOTH sides must agree on this
 * exact form — it's the one hard sync point with the World side. If their signer
 * uses a different canonicalization, verification fails and we adjust here.
 */
export function canonicalAuthorization(auth: PayoutAuthorization): string {
  const keys = Object.keys(auth).sort() as (keyof PayoutAuthorization)[];
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = auth[k];
  return JSON.stringify(obj);
}

// Single-use nonce ledger. In-memory is fine for the demo (one server process);
// production would persist this so a restart can't replay. Documented limitation.
const usedNonces = new Set<string>();

export interface AuthzResult {
  ok: boolean;
  reason?: string;
  humanId?: string;
  tier?: number;
}

/**
 * Verify a signed payout authorization for a specific engagement. `now` is
 * injectable for tests. Consumes the nonce on success.
 */
export async function verifyPayoutAuthorization(
  auth: PayoutAuthorization,
  signature: string,
  engagementId: string,
  now: number = Date.now(),
): Promise<AuthzResult> {
  if (!worldAuthEnabled) return { ok: false, reason: 'world-auth-disabled' };

  if (auth.engagementId !== engagementId) {
    return { ok: false, reason: 'engagement-mismatch' };
  }
  if (typeof auth.expiresAt !== 'number' || auth.expiresAt * 1000 <= now) {
    // expiresAt is epoch SECONDS in the contract example.
    return { ok: false, reason: 'authorization-expired' };
  }
  if (usedNonces.has(auth.nonce)) {
    return { ok: false, reason: 'nonce-replayed' };
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: config.world.signerAddress as `0x${string}`,
      message: canonicalAuthorization(auth),
      signature: signature as `0x${string}`,
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? `bad-signature: ${err.message}` : 'bad-signature' };
  }
  if (!valid) return { ok: false, reason: 'signature-mismatch' };

  usedNonces.add(auth.nonce);
  return { ok: true, humanId: auth.humanId, tier: auth.tier };
}

/** Test/demo hook: clear the nonce ledger. */
export function _resetNonces(): void {
  usedNonces.clear();
}
