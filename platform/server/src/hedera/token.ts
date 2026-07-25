import {
  AccountCreateTransaction,
  TokenAssociateTransaction,
  TokenGrantKycTransaction,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TransferTransaction,
  PrivateKey,
  AccountId,
  TokenId,
  Hbar,
} from '@hashgraph/sdk';
import { config, hederaEnabled } from '../config.js';
import { hederaClient, operatorId } from './client.js';

/**
 * Native HTS operations on the DEFPOINT token — no Solidity, all protocol-level.
 *
 * The operator is the token treasury and holds the kyc/freeze keys, so it can:
 *   - create a unit account and hand it a fresh key (onboarding)
 *   - associate + KYC-grant that account so it may hold DEFPOINT
 *   - transfer points treasury → unit (the payout)
 *   - freeze / unfreeze a unit while a downing is disputed
 *
 * Unit private keys are returned to the caller to persist. For the demo the
 * settlement service custodies them; in production this would be a proper
 * custody solution or unit-held keys (documented as a limitation in docs/05).
 */

function tokenId(): TokenId {
  return TokenId.fromString(config.hedera.defpointTokenId);
}

function requireToken(): void {
  if (!hederaEnabled) throw new Error('Hedera disabled');
  if (!config.hedera.defpointTokenId) throw new Error('HEDERA_DEFPOINT_TOKEN_ID not set — run hedera:setup');
}

export interface NewUnitAccount {
  accountId: string;
  privateKey: string; // DER-encoded; caller persists (demo custody)
  publicKey: string;
}

/** Create a fresh Hedera account for a unit. Operator pays the create fee; the
 * account starts at 0 HBAR (operator keeps paying its later fees as tx payer). */
export async function createUnitAccount(): Promise<NewUnitAccount> {
  requireToken();
  const client = hederaClient();
  const key = PrivateKey.generateED25519();
  const resp = await new AccountCreateTransaction()
    .setKey(key.publicKey)
    .setInitialBalance(new Hbar(0))
    .execute(client);
  const receipt = await resp.getReceipt(client);
  return {
    accountId: receipt.accountId!.toString(),
    privateKey: key.toStringDer(),
    publicKey: key.publicKey.toStringDer(),
  };
}

/** Associate DEFPOINT with a unit account, then KYC-grant it so it may receive
 * points. Association is signed by the unit key; KYC by the operator (kycKey).
 * Returns the two transaction ids for the journal. */
export async function associateAndGrantKyc(
  accountId: string,
  accountKeyDer: string,
): Promise<{ associateTx: string; kycTx: string }> {
  requireToken();
  const client = hederaClient();
  const unitKey = PrivateKey.fromStringDer(accountKeyDer);
  const acct = AccountId.fromString(accountId);

  const assocResp = await (
    await new TokenAssociateTransaction()
      .setAccountId(acct)
      .setTokenIds([tokenId()])
      .freezeWith(client)
      .sign(unitKey)
  ).execute(client);
  await assocResp.getReceipt(client);

  const kycResp = await new TokenGrantKycTransaction()
    .setAccountId(acct)
    .setTokenId(tokenId())
    .execute(client);
  await kycResp.getReceipt(client);

  return {
    associateTx: assocResp.transactionId.toString(),
    kycTx: kycResp.transactionId.toString(),
  };
}

/** Transfer DEFPOINT from treasury (operator) to a unit account. Returns the tx id. */
export async function payDefpoint(toAccountId: string, amount: number): Promise<{ transferTx: string }> {
  requireToken();
  if (amount <= 0) throw new Error('amount must be positive');
  const client = hederaClient();
  const resp = await new TransferTransaction()
    .addTokenTransfer(tokenId(), operatorId(), -amount)
    .addTokenTransfer(tokenId(), AccountId.fromString(toAccountId), amount)
    .execute(client);
  await resp.getReceipt(client);
  return { transferTx: resp.transactionId.toString() };
}

/** Freeze / unfreeze a unit's DEFPOINT account (dispute hold). */
export async function freezeUnit(accountId: string): Promise<{ freezeTx: string }> {
  requireToken();
  const client = hederaClient();
  const resp = await new TokenFreezeTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenId(tokenId())
    .execute(client);
  await resp.getReceipt(client);
  return { freezeTx: resp.transactionId.toString() };
}

export async function unfreezeUnit(accountId: string): Promise<{ unfreezeTx: string }> {
  requireToken();
  const client = hederaClient();
  const resp = await new TokenUnfreezeTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenId(tokenId())
    .execute(client);
  await resp.getReceipt(client);
  return { unfreezeTx: resp.transactionId.toString() };
}

function mirrorBase(): string {
  return config.hedera.network === 'mainnet'
    ? 'https://mainnet.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com';
}

/** Read a unit's DEFPOINT balance via the Mirror Node (free, no keys). */
export async function defpointBalance(accountId: string): Promise<number> {
  if (!config.hedera.defpointTokenId) return 0;
  const url = `${mirrorBase()}/api/v1/accounts/${accountId}/tokens?token.id=${config.hedera.defpointTokenId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mirror node ${res.status} for account ${accountId}`);
  const body = (await res.json()) as { tokens?: Array<{ token_id: string; balance: number }> };
  const row = body.tokens?.find((t) => t.token_id === config.hedera.defpointTokenId);
  return row?.balance ?? 0;
}
