import type { Notifier } from "./alerts.js";
import type { SettingsStore } from "./settings.js";
import { sendTelegram } from "./telegram.js";
import { sendEmail } from "./email.js";

// Fans an alert message out to every configured channel, reading live settings
// each time so credential edits take effect without a restart.
export class FanoutNotifier implements Notifier {
  constructor(private store: SettingsStore, private fetchFn: typeof fetch = fetch) {}

  async send(message: string): Promise<void> {
    const s = this.store.get();
    await Promise.all([
      sendTelegram(s.telegram, message, this.fetchFn),
      sendEmail(s.email, "VPS 监控告警", message),
    ]);
  }
}
