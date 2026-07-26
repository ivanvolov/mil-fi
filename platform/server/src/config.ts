import { config as loadDotenv } from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** All secrets come from process.env / the repo-root `.env`. No remote secret
 * manager.
 *
 * The single `.env` lives at the repo root (MilFi/.env) so it's shared between
 * the applications in this repo; subfolders only carry `.env.example`
 * templates. The path is resolved relative to this file, so loading works from
 * any CWD. dotenv never overwrites vars that are already set — real
 * environment variables (e.g. set by Render) always win. */

const here = path.dirname(fileURLToPath(import.meta.url)); // platform/server/src
loadDotenv({ path: path.resolve(here, '../../../.env') }); // repo root: MilFi/.env

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string {
  return process.env[name] ?? '';
}

function readSessionSecret(): string {
  const v = optional('SESSION_SECRET');
  if (v && v.length >= 32) return v;
  if (isProd) throw new Error('SESSION_SECRET must be set (>=32 chars) in production');
  const dev = crypto.randomBytes(32).toString('base64url');
  console.warn('[config] SESSION_SECRET not set — generated an ephemeral dev secret (cookies invalidated on next server restart)');
  return dev;
}

export const config = {
  mongoUri: required('MONGODB_URI'),
  mongoDb: process.env.MONGODB_DB ?? 'milfy-app',
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  sessionSecret: readSessionSecret(),
  openaiApiKey: optional('OPENAI_API_KEY'),
  nodeEnv,
  isProd,
  serveStatic: (process.env.SERVE_STATIC ?? (isProd ? 'true' : 'false')) === 'true',
  clientDistPath: process.env.CLIENT_DIST_PATH ?? '../client/dist',
  renderWebhookSecret: optional('RENDER_WEBHOOK_SECRET'),
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  telegramChatId: optional('TELEGRAM_CHAT_ID'),

  // World integration (docs/04-integration-contract.md). All optional: with no
  // signer configured, the settle-agent falls back to the humanBacked boolean
  // (demo mode) instead of verifying a signed payout authorization.
  world: {
    // Base URL of the World mini-app service we call for Interface 3 (verdict push).
    baseUrl: (process.env.WORLD_BASE_URL ?? '').replace(/\/$/, ''),
    // Shared bearer token, both directions (demo simplicity).
    serviceToken: process.env.WORLD_SERVICE_TOKEN ?? '',
    // The address that signs payout authorizations (Interface 1). When set, the
    // payment path REQUIRES a valid signed authorization before releasing funds.
    signerAddress: (process.env.WORLD_SIGNER_ADDRESS ?? '').toLowerCase(),
    // IDKit relying-party identity for the one-time operator verification gate
    // (auth/worldVerify.ts). Same Developer Portal app as app/my-first-mini-app —
    // reusing it avoids provisioning a second RP under deadline pressure.
    rpSigningKey: optional('RP_SIGNING_KEY'),
    rpId: optional('RP_ID'),
    // The claim-agent's AgentKit identity key (EVM, holds no funds — signs the
    // SIWE challenge on authorize-payout). Register its address once in
    // AgentBook: `npx @worldcoin/agentkit-cli register <address>`.
    agentWalletKey: optional('AGENT_WALLET_KEY'),
    // CAIP-2 chain the agent signs on; AgentBook lives on World Chain mainnet.
    agentChainId: process.env.AGENT_CHAIN_ID ?? 'eip155:480',
  },

  // 0G Compute router (OpenAI-compatible). Hosts the vision agents (A + B).
  // OG_API_KEY_TEE (Private trust mode — inference runs inside a TEE) takes
  // priority so verdicts are genuinely TEE-sealed; falls back to the Standard
  // key only if no TEE key is configured.
  zerog: {
    baseUrl: (process.env.ZG_ROUTER_BASE_URL ?? 'https://router-api-testnet.integratenetwork.work/v1').replace(/\/$/, ''),
    apiKey: process.env.OG_API_KEY_TEE ?? process.env.ZG_ROUTER_API_KEY ?? process.env.OG_API_KEY ?? '',
    model: process.env.ZG_MODEL ?? 'qwen2.5-omni',
  },

  // Hedera testnet. Operator id/key come from portal.hedera.com; the token and
  // topic ids are minted once by `npm run hedera:setup` and pasted back here.
  // All optional: when unset the Hedera layer is disabled and the pipeline still
  // runs (verdicts just don't get journaled/paid). See src/hedera/.
  hedera: {
    network: process.env.HEDERA_NETWORK ?? 'testnet',
    operatorId: optional('HEDERA_OPERATOR_ID'),
    operatorKey: optional('HEDERA_OPERATOR_KEY'),
    // Key type of HEDERA_OPERATOR_KEY: ECDSA (default for new portal accounts) or ED25519.
    keyType: (process.env.HEDERA_KEY_TYPE ?? 'ECDSA').toUpperCase(),
    defpointTokenId: optional('HEDERA_DEFPOINT_TOKEN_ID'),
    evidenceTopicId: optional('HEDERA_EVIDENCE_TOPIC_ID'),
  },
};

/** True only when operator creds are present — guards every live Hedera call so
 * the platform degrades gracefully with no account configured. */
export const hederaEnabled = Boolean(config.hedera.operatorId && config.hedera.operatorKey);

/** True when a World signer is configured — the payment path then REQUIRES a
 * valid signed payout authorization (Interface 1) instead of the demo fallback. */
export const worldAuthEnabled = Boolean(config.world.signerAddress);

/** True when we can reach the World service to push verdicts (Interface 3). */
export const worldClientEnabled = Boolean(config.world.baseUrl && config.world.serviceToken);

/** True when the one-time World ID verification gate (auth/worldVerify.ts) can run. */
export const worldIdVerifyEnabled = Boolean(config.world.rpSigningKey && config.world.rpId);
