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
};
