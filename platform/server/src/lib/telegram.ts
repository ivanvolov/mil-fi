import { config } from '../config.js';

/** Post an HTML-formatted message to the configured Telegram chat.
 *  No-ops (returns without error) when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID
 *  is missing so the app never breaks just because Telegram isn't wired. */
export async function postToTelegram(text: string): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Group a raw invite code into 4-digit chunks (matches the seed script's display). */
function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** Send a boot notification. Includes environment (staging / prod), the commit sha
 *  Render injects as RENDER_GIT_COMMIT, the service URL if known, and the first few
 *  active invite codes so the operator has them to hand out. Silent no-op outside
 *  production so local dev doesn't spam the chat. */
export async function notifyBoot(kind: 'started' | 'refreshed', inviteCodes: string[] = []): Promise<void> {
  if (!config.isProd) return;
  const svc = process.env.RENDER_SERVICE_NAME ?? config.mongoDb;
  const sha = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  const url = process.env.RENDER_EXTERNAL_URL;
  const emoji = kind === 'refreshed' ? '🔄' : '✅';
  const label = kind === 'refreshed' ? 'DB refreshed from prod' : 'started';
  const shaLine = sha ? `\n<code>${sha}</code>` : '';
  const urlLine = url ? `\n${url}` : '';
  const codes = inviteCodes.slice(0, 5);
  const codesLine = codes.length
    ? `\n\n<b>Active invite codes (${codes.length}):</b>\n` +
      codes.map((c) => `<code>${escapeHtml(formatInviteCode(c))}</code>`).join('\n')
    : '';
  try {
    await postToTelegram(`${emoji} <b>${escapeHtml(svc)}</b> · ${label}${shaLine}${urlLine}${codesLine}`);
  } catch (err) {
    console.warn(`[telegram] boot notify failed: ${(err as Error).message}`);
  }
}
