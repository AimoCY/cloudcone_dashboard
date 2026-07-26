import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FanoutNotifier } from "./notifier.js";
import { SettingsStore, type EditableSettings } from "./settings.js";

const defaults: EditableSettings = {
  thresholds: { cpu_pct: 90, mem_pct: 90, disk_pct: 90, traffic_pct: 90, offline_seconds: 60 },
  retention_days: 7,
  telegram: { bot_token: "ADMIN-BOT", chat_id: "ADMIN-CHAT" },
  email: { smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", from: "", recipients: "" },
};

describe("FanoutNotifier tenant routing", () => {
  it("uses the owning user's notification credentials", async () => {
    const store = new SettingsStore(
      join(mkdtempSync(join(tmpdir(), "notify-")), "settings.json"), defaults, ["admin"],
    );
    store.update("alice", { telegram: { bot_token: "ALICE-BOT", chat_id: "ALICE-CHAT" } });

    const calls: { url: string; body: any }[] = [];
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: 200 });
    };
    const owners: Record<string, string> = { "vps-a": "admin", "vps-b": "alice" };
    const notifier = new FanoutNotifier(store, (vps) => owners[vps], fetchFn as typeof fetch);

    await notifier.send("vps-b", "alice alert");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("ALICE-BOT");
    expect(calls[0].body).toMatchObject({ chat_id: "ALICE-CHAT", text: "alice alert" });

    await notifier.send("vps-a", "admin alert");
    expect(calls[1].url).toContain("ADMIN-BOT");
    expect(calls[1].body.chat_id).toBe("ADMIN-CHAT");
  });
});
