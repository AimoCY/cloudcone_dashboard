export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

// Sends a Telegram message. No-op if not configured; failures are swallowed so
// the alert engine is never blocked by a notification outage. `fetchFn` is
// injectable for testing.
export async function sendTelegram(
  cfg: TelegramConfig,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!cfg.bot_token || !cfg.chat_id) return;
  try {
    await fetchFn(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chat_id, text }),
    });
  } catch (err) {
    console.error("telegram: send failed:", err);
  }
}
