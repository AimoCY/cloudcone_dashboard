import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Thresholds } from "./alerts.js";
import type { TelegramConfig } from "./telegram.js";
import type { EmailConfig } from "./email.js";

// The subset of configuration that the Settings page can edit at runtime.
export interface EditableSettings {
  thresholds: Thresholds;
  retention_days: number;
  telegram: TelegramConfig;
  email: EmailConfig;
}

export interface SettingsPatch {
  thresholds?: Partial<Thresholds>;
  retention_days?: number;
  telegram?: Partial<TelegramConfig>;
  email?: Partial<EmailConfig>;
}

function merge(base: EditableSettings, patch: SettingsPatch): EditableSettings {
  return {
    thresholds: { ...base.thresholds, ...(patch.thresholds ?? {}) },
    retention_days: patch.retention_days ?? base.retention_days,
    telegram: { ...base.telegram, ...(patch.telegram ?? {}) },
    email: { ...base.email, ...(patch.email ?? {}) },
  };
}

// Holds the runtime-editable settings. Initialised from config.json defaults,
// overlaid with any persisted overrides; update() merges + persists to disk.
export class SettingsStore {
  private current: EditableSettings;

  constructor(private path: string, defaults: EditableSettings) {
    this.current = defaults;
    if (existsSync(path)) {
      try {
        this.current = merge(defaults, JSON.parse(readFileSync(path, "utf8")) as SettingsPatch);
      } catch (err) {
        console.error("settings: failed to read, using defaults:", err);
      }
    }
  }

  get(): EditableSettings {
    return this.current;
  }

  update(patch: SettingsPatch): EditableSettings {
    this.current = merge(this.current, patch);
    try {
      writeFileSync(this.path, JSON.stringify(this.current, null, 2));
    } catch (err) {
      console.error("settings: write failed:", err);
    }
    return this.current;
  }
}
