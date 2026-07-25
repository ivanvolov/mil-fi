import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/** Render → Telegram deploy notifier.
 *
 * Render sends `deploy_started` / `deploy_ended` webhooks to `/api/v1/hooks/render`.
 * We verify the HMAC-SHA256 signature (Stripe-style: `t=<ts>,v1=<hex>` where the signed
 * payload is `<ts>.<raw body>`), then post a 3-line summary to Telegram.
 *
 * Env vars (all three required; if any is missing the endpoint no-ops so the app still
 * boots on developer machines and on Render before secrets are set):
 *   - RENDER_WEBHOOK_SECRET  — copied from the Render dashboard's webhook config
 *   - TELEGRAM_BOT_TOKEN     — a bot from @BotFather
 *   - TELEGRAM_CHAT_ID       — the numeric chat/channel id (get from getUpdates)
 *
 * See https://render.com/docs/webhooks for payload/signature details.
 */

type RenderPayload = {
  id?: string;
  type?: string;
  timestamp?: string;
  data?: {
    id?: string;
    serviceId?: string;
    // Deploy status is on `deploy_ended` events. Statuses per Render docs:
    // live | build_failed | update_failed | pre_deploy_failed | canceled | deactivated | ...
    deploy?: {
      id?: string;
      status?: string;
      commit?: { id?: string; message?: string };
    };
    service?: { id?: string; name?: string; url?: string };
  };
};

function parseSignatureHeader(sig: string): { t: string; v1: string } | null {
  const parts = sig.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!t || !v1) return null;
  return { t, v1 };
}

function verifySignature(sigHeader: string, rawBody: Buffer, secret: string): boolean {
  const parsed = parseSignatureHeader(sigHeader);
  if (!parsed) return false;
  const signedPayload = Buffer.concat([Buffer.from(parsed.t + '.'), rawBody]);
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const given = Buffer.from(parsed.v1, 'hex');
  const exp = Buffer.from(expected, 'hex');
  if (given.length !== exp.length) return false;
  return timingSafeEqual(given, exp);
}

const OK_STATUSES = new Set(['live']);
const FAIL_STATUSES = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']);

function formatMessage(p: RenderPayload): string | null {
  const kind = p.type;
  if (kind !== 'deploy_ended' && kind !== 'deploy_started') return null;
  const serviceName = p.data?.service?.name ?? p.data?.serviceId ?? 'unknown';
  const serviceUrl = p.data?.service?.url;
  const status = p.data?.deploy?.status;
  const commitSha = p.data?.deploy?.commit?.id?.slice(0, 7);
  const commitMsg = p.data?.deploy?.commit?.message?.split('\n')[0]?.slice(0, 80);
  if (kind === 'deploy_started') {
    return `🔨 <b>${serviceName}</b> · deploy started${commitSha ? ` · ${commitSha}` : ''}${commitMsg ? `\n<i>${escapeHtml(commitMsg)}</i>` : ''}`;
  }
  const emoji = status && OK_STATUSES.has(status) ? '✅' : FAIL_STATUSES.has(status ?? '') ? '❌' : 'ℹ️';
  const statusLine = `${emoji} <b>${serviceName}</b> · ${status ?? 'unknown'}`;
  const shaLine = commitSha ? `\n<code>${commitSha}</code>${commitMsg ? ` <i>${escapeHtml(commitMsg)}</i>` : ''}` : '';
  const urlLine = serviceUrl ? `\n${serviceUrl}` : '';
  return `${statusLine}${shaLine}${urlLine}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function postToTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram sendMessage failed: ${res.status} ${body}`);
  }
}

export async function registerHookRoutes(app: FastifyInstance): Promise<void> {
  // Encapsulated: raw-body JSON parser scoped to this plugin so the rest of the API
  // keeps its normal JSON parsing behavior.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/hooks/render', async (req, reply) => {
    const raw = req.body as Buffer;
    const secret = config.renderWebhookSecret;
    const botToken = config.telegramBotToken;
    const chatId = config.telegramChatId;

    // If any env var is missing, ack with 200 (don't leak config state to Render) and
    // log a warning so the operator sees why nothing showed up in Telegram.
    if (!secret || !botToken || !chatId) {
      req.log.warn({ hasSecret: !!secret, hasBot: !!botToken, hasChat: !!chatId }, 'render hook: notifier disabled (missing env vars)');
      return reply.code(200).send({ ok: true, notified: false });
    }

    const sig = req.headers['x-render-signature'];
    if (typeof sig !== 'string' || !verifySignature(sig, raw, secret)) {
      req.log.warn('render hook: signature verification failed');
      return reply.code(401).send({ ok: false, error: 'bad signature' });
    }

    let payload: RenderPayload;
    try {
      payload = JSON.parse(raw.toString('utf8')) as RenderPayload;
    } catch {
      return reply.code(400).send({ ok: false, error: 'bad json' });
    }

    const text = formatMessage(payload);
    if (!text) {
      // Event type we don't care about (e.g. deploy_updated); ack silently.
      return reply.code(200).send({ ok: true, notified: false, type: payload.type });
    }

    try {
      await postToTelegram(text);
      return reply.code(200).send({ ok: true, notified: true });
    } catch (err) {
      req.log.error({ err }, 'render hook: telegram post failed');
      return reply.code(200).send({ ok: true, notified: false, error: (err as Error).message });
    }
  });
}
