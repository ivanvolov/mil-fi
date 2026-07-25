import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TopicCreateTransaction,
  Hbar,
} from '@hashgraph/sdk';
import { config, hederaEnabled } from '../config.js';
import { hederaClient, operatorId, operatorKey, closeHedera } from '../hedera/client.js';

/**
 * One-time provisioning of the two on-chain objects the settlement layer needs:
 *
 *   1. DEFPOINT — the reward token (HTS, native, no contract). Fungible, 0
 *      decimals (points are whole units). The operator is treasury and holds the
 *      initial supply; the settle-agent transfers from treasury to unit accounts.
 *      Compliance keys live at the protocol level, not in Solidity:
 *        - kycKey    → only World-verified accounts may hold DEFPOINT
 *        - freezeKey → freeze a unit's account while a downing is disputed
 *        - pauseKey  → emergency stop for the whole token
 *        - supplyKey → mint more points into treasury later
 *        - adminKey  → allows updating the token config
 *
 *   2. Evidence topic — an HCS topic (native "append message, get consensus
 *      timestamp" log). The settlement service writes the full trail of each
 *      engagement here; anyone can replay it on HashScan. submitKey is the
 *      operator so only we can append.
 *
 * Run once:  npm run hedera:setup
 * Then paste the printed ids into the repo-root .env:
 *   HEDERA_DEFPOINT_TOKEN_ID=0.0.xxxxx
 *   HEDERA_EVIDENCE_TOPIC_ID=0.0.yyyyy
 */

const TOKEN_NAME = 'Defense Point';
const TOKEN_SYMBOL = 'DEFPOINT';
const INITIAL_SUPPLY = 1_000_000; // points minted to treasury at genesis
const TOPIC_MEMO = 'milfi-evidence-journal';

async function main() {
  if (!hederaEnabled) {
    console.error(
      '[hedera:setup] HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY are not set.\n' +
        'Create a testnet account at https://portal.hedera.com, then add to the repo-root .env:\n' +
        '  HEDERA_OPERATOR_ID=0.0.xxxxx\n' +
        '  HEDERA_OPERATOR_KEY=302e...\n' +
        '  HEDERA_KEY_TYPE=ECDSA   # or ED25519, matching the portal account',
    );
    process.exit(1);
  }

  const client = hederaClient();
  const opId = operatorId();
  const opKey = operatorKey();
  const pubKey = opKey.publicKey;

  console.log(`[hedera:setup] network=${config.hedera.network} operator=${opId.toString()}`);

  // --- 1. DEFPOINT token -----------------------------------------------------
  if (config.hedera.defpointTokenId) {
    console.log(`[hedera:setup] DEFPOINT already set (${config.hedera.defpointTokenId}) — skipping token create`);
  } else {
    console.log('[hedera:setup] creating DEFPOINT token…');
    const tokenTx = await new TokenCreateTransaction()
      .setTokenName(TOKEN_NAME)
      .setTokenSymbol(TOKEN_SYMBOL)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(0)
      .setInitialSupply(INITIAL_SUPPLY)
      .setTreasuryAccountId(opId)
      .setSupplyType(TokenSupplyType.Infinite)
      .setAdminKey(pubKey)
      .setSupplyKey(pubKey)
      .setKycKey(pubKey)
      .setFreezeKey(pubKey)
      .setPauseKey(pubKey)
      .setMaxTransactionFee(new Hbar(30))
      .freezeWith(client)
      .sign(opKey);
    const tokenResp = await tokenTx.execute(client);
    const tokenRcpt = await tokenResp.getReceipt(client);
    const tokenId = tokenRcpt.tokenId!.toString();
    console.log(`[hedera:setup] ✓ DEFPOINT token created: ${tokenId}`);
    console.log(`               initial supply ${INITIAL_SUPPLY} held by treasury ${opId.toString()}`);
    console.log(`               HEDERA_DEFPOINT_TOKEN_ID=${tokenId}`);
  }

  // --- 2. Evidence topic -----------------------------------------------------
  if (config.hedera.evidenceTopicId) {
    console.log(`[hedera:setup] evidence topic already set (${config.hedera.evidenceTopicId}) — skipping topic create`);
  } else {
    console.log('[hedera:setup] creating evidence HCS topic…');
    const topicTx = await new TopicCreateTransaction()
      .setTopicMemo(TOPIC_MEMO)
      .setSubmitKey(pubKey)
      .setAdminKey(pubKey)
      .freezeWith(client)
      .sign(opKey);
    const topicResp = await topicTx.execute(client);
    const topicRcpt = await topicResp.getReceipt(client);
    const topicId = topicRcpt.topicId!.toString();
    console.log(`[hedera:setup] ✓ evidence topic created: ${topicId}`);
    console.log(`               HEDERA_EVIDENCE_TOPIC_ID=${topicId}`);
  }

  console.log('\n[hedera:setup] done. Paste the printed ids into the repo-root .env and restart the server.');
  closeHedera();
}

main().catch((err) => {
  console.error('[hedera:setup] failed:', err);
  closeHedera();
  process.exit(1);
});
