import { privateKeyToAccount } from 'viem/accounts';

/**
 * Interface 1 issuer side (docs/05-integration-contract.md): the World service
 * signs a payout authorization that the platform's settle-agent verifies before
 * releasing funds. Signing is a plain EIP-191 signature with our own key — it
 * does NOT need the World Developer Portal (that's only for World ID *verification*
 * of a live human). So this whole loop is testable without the portal.
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
 * Canonical form the signature is computed over. MUST stay byte-identical to the
 * platform's canonicalAuthorization (server/src/world/auth.ts): keys sorted
 * lexicographically, JSON.stringify, no extra whitespace.
 */
export function canonicalAuthorization(auth: PayoutAuthorization): string {
  const keys = Object.keys(auth).sort() as (keyof PayoutAuthorization)[];
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = auth[k];
  return JSON.stringify(obj);
}

function signerAccount() {
  const key = process.env.WORLD_SIGNER_KEY;
  if (!key) return null;
  return privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`);
}

/** Public address of the signer — paste into the platform's WORLD_SIGNER_ADDRESS. */
export function signerAddress(): string | null {
  return signerAccount()?.address ?? null;
}

export async function signAuthorization(auth: PayoutAuthorization): Promise<string | null> {
  const account = signerAccount();
  if (!account) return null;
  return account.signMessage({ message: canonicalAuthorization(auth) });
}
