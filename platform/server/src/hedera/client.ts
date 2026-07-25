import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { config, hederaEnabled } from '../config.js';

/**
 * Lazily-built, shared Hedera SDK client for the configured operator.
 *
 * The operator is the account that pays fees and signs admin operations
 * (token/topic creation, treasury transfers). Its id + key come from
 * portal.hedera.com and live in the repo-root `.env` as HEDERA_OPERATOR_ID /
 * HEDERA_OPERATOR_KEY (see config.ts).
 *
 * Everything here is pure `@hashgraph/sdk` — no Solidity, no EVM. That is a hard
 * project constraint (Hedera "No Solidity" track): we only ever touch native
 * services (HTS token ops, HCS topic messages, scheduled txns) through the SDK.
 */

let cached: Client | null = null;

/** Parse the operator key honoring the configured key type (ECDSA vs ED25519).
 * Tolerates a leading 0x (portal shows HEX ECDSA keys as 0x…). */
export function operatorKey(): PrivateKey {
  const raw = config.hedera.operatorKey.replace(/^0x/i, '');
  return config.hedera.keyType === 'ED25519'
    ? PrivateKey.fromStringED25519(raw)
    : PrivateKey.fromStringECDSA(raw);
}

export function operatorId(): AccountId {
  return AccountId.fromString(config.hedera.operatorId);
}

/**
 * Return the shared client, or throw if Hedera isn't configured. Callers that
 * want to no-op instead should gate on `hederaEnabled` first.
 */
export function hederaClient(): Client {
  if (!hederaEnabled) {
    throw new Error(
      'Hedera is not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY ' +
        'in the repo-root .env (create a testnet account at https://portal.hedera.com).',
    );
  }
  if (cached) return cached;

  const client =
    config.hedera.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId(), operatorKey());
  cached = client;
  return client;
}

/** Close the shared client (call on shutdown). Safe when never opened. */
export function closeHedera(): void {
  cached?.close();
  cached = null;
}
