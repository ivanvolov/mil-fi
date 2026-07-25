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

  // 0G Compute router (OpenAI-compatible). Hosts the vision agents (A + B).
  // Key reused from the verification/ harness; falls back to root OG_API_KEY.
  zerog: {
    baseUrl: (process.env.ZG_ROUTER_BASE_URL ?? 'https://router-api-testnet.integratenetwork.work/v1').replace(/\/$/, ''),
    apiKey: process.env.ZG_ROUTER_API_KEY ?? process.env.OG_API_KEY ?? '',
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
