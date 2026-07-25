import { config } from '../config.js';
import { postToTelegram } from '../lib/telegram.js';

console.log(`[test-tg] isProd=${config.isProd} hasToken=${!!config.telegramBotToken} hasChat=${!!config.telegramChatId}`);

if (!config.telegramBotToken || !config.telegramChatId) {
  console.error('[test-tg] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in env (.env / process.env)');
  process.exit(1);
}

await postToTelegram('🧪 test message from hoc-orchestration diag script (dev env)');
console.log('[test-tg] sent ok');
