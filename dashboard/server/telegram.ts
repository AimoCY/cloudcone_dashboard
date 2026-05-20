// Telegram pushes alert messages. Failures are swallowed (logged) so the
// alert engine is never blocked by a notification outage.
export class Telegram {
  constructor(
    private botToken: string,
    private chatId: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async send(text: string): Promise<void> {
    if (!this.botToken || !this.chatId) return;
    try {
      await this.fetchFn(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
    } catch (err) {
      console.error("telegram: send failed:", err);
    }
  }
}
