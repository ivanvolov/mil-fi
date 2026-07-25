/**
 * Shared Zod primitives for World Mini App payloads.
 *
 * Pattern ported from the Regata project (`src/lib/validators/`): every API route
 * validates its input with a Zod schema BEFORE touching business logic. The CTO agent
 * enforces this in code review.
 *
 * Usage in a route:
 *
 *   const parsed = VerifyProofBody.safeParse(await request.json());
 *   if (!parsed.success) {
 *     return NextResponse.json(
 *       { error: 'Invalid request', details: parsed.error.flatten() },
 *       { status: 400 }
 *     );
 *   }
 *   const { payload, action } = parsed.data;   // fully typed
 */

import { z } from 'zod';

/** 0x-prefixed 20-byte Ethereum address */
export const EthAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a 0x-prefixed Ethereum address');

/** 0x-prefixed 32-byte hash — used for World ID nullifier hashes and merkle roots */
export const Hash32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a 0x-prefixed 32-byte hex string');

/** Developer Portal app identifier */
export const AppId = z
  .string()
  .regex(/^app_[a-zA-Z0-9]+$/, 'Must be a Developer Portal app id (app_...)');

/** World ID action identifier, as configured in the Developer Portal */
export const ActionId = z.string().min(1).max(64);

/** Verification level returned by MiniKit's verify command */
export const VerificationLevel = z.enum(['orb', 'device']);

/**
 * Shape of a World ID proof as returned by MiniKit `verify`.
 * Verify against https://docs.world.org before relying on this — the SDK moves fast.
 */
export const WorldIdProof = z.object({
  proof: z.string(),
  merkle_root: Hash32,
  nullifier_hash: Hash32,
  verification_level: VerificationLevel,
});

/** Common envelope for a request that must identify the acting wallet */
export const WalletScoped = z.object({
  walletAddress: EthAddress,
});

export type WorldIdProof = z.infer<typeof WorldIdProof>;
