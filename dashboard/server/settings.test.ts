import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettingsStore, type EditableSettings } from "./settings.js";

const defaults: EditableSettings = {
  thresholds: { cpu_pct: 90, mem_pct: 90, disk_pct: 90, traffic_pct: 90, offline_seconds: 60 },
  retention_days: 7,
  telegram: { bot_token: "BT", chat_id: "CID" },
  email: { smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", from: "", recipients: "" },
};

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), "set-")), "settings.json");
}

describe("SettingsStore", () => {
  it("uses defaults when no override file exists", () => {
    const s = new SettingsStore(tmpPath(), defaults);
    expect(s.get().thresholds.cpu_pct).toBe(90);
    expect(s.get().retention_days).toBe(7);
  });

  it("update merges nested fields, leaves siblings intact, and persists", () => {
    const path = tmpPath();
    const s = new SettingsStore(path, defaults);
    s.update({ thresholds: { cpu_pct: 70 }, retention_days: 14 });
    expect(s.get().thresholds.cpu_pct).toBe(70);
    expect(s.get().thresholds.mem_pct).toBe(90); // untouched
    expect(s.get().retention_days).toBe(14);

    // A fresh store loads the persisted overrides on top of defaults.
    const reloaded = new SettingsStore(path, defaults);
    expect(reloaded.get().thresholds.cpu_pct).toBe(70);
    expect(reloaded.get().retention_days).toBe(14);
  });
});
