import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Thresholds } from "./alerts.js";
import type { TelegramConfig } from "./telegram.js";
import type { EmailConfig } from "./email.js";

export interface UserEditableSettings {
  thresholds: Thresholds;
  telegram: TelegramConfig;
  email: EmailConfig;
}

// retention_days is global because all tenants share one samples table. The
// remaining fields belong to an individual user and control only their VPSes.
export interface EditableSettings extends UserEditableSettings {
  retention_days: number;
}

export interface SettingsPatch {
  thresholds?: Partial<Thresholds>;
  retention_days?: number;
  telegram?: Partial<TelegramConfig>;
  email?: Partial<EmailConfig>;
}

interface PersistedSettingsV2 {
  version: 2;
  retention_days: number;
  users: Record<string, UserEditableSettings>;
}

function mergeUser(base: UserEditableSettings, patch: SettingsPatch): UserEditableSettings {
  return {
    thresholds: { ...base.thresholds, ...(patch.thresholds ?? {}) },
    telegram: { ...base.telegram, ...(patch.telegram ?? {}) },
    email: { ...base.email, ...(patch.email ?? {}) },
  };
}

function emptyTelegram(): TelegramConfig {
  return { bot_token: "", chat_id: "" };
}

function emptyEmail(defaults: EmailConfig): EmailConfig {
  return {
    smtp_host: "",
    smtp_port: defaults.smtp_port,
    smtp_user: "",
    smtp_pass: "",
    from: "",
    recipients: "",
  };
}

function isV2(value: unknown): value is PersistedSettingsV2 {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.version === 2 && !!obj.users && typeof obj.users === "object";
}

// Holds runtime-editable settings. Version 1 used one global object; it is
// loaded as the primary admin's settings and written back as version 2 on the
// next edit. Secrets are always persisted with mode 0600.
export class SettingsStore {
  private retentionDays: number;
  private users = new Map<string, UserEditableSettings>();
  private adminUserIds: Set<string>;
  private primaryAdminId: string;

  constructor(
    private path: string,
    private defaults: EditableSettings,
    adminUserIds: string[] = ["admin"],
  ) {
    this.retentionDays = defaults.retention_days;
    this.adminUserIds = new Set(adminUserIds);
    this.primaryAdminId = adminUserIds[0] ?? "admin";

    if (!existsSync(path)) return;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (isV2(parsed)) {
        if (Number.isFinite(parsed.retention_days) && parsed.retention_days > 0) {
          this.retentionDays = parsed.retention_days;
        }
        for (const [userId, value] of Object.entries(parsed.users)) {
          this.users.set(userId, mergeUser(this.baseFor(userId), value));
        }
      } else {
        const legacy = parsed as SettingsPatch;
        if (typeof legacy.retention_days === "number" && legacy.retention_days > 0) {
          this.retentionDays = legacy.retention_days;
        }
        this.users.set(this.primaryAdminId, mergeUser(this.baseFor(this.primaryAdminId), legacy));
      }
      chmodSync(path, 0o600);
    } catch (err) {
      console.error("settings: failed to read, using defaults:", err);
    }
  }

  get(userId: string): EditableSettings {
    const value = this.users.get(userId) ?? this.baseFor(userId);
    return {
      thresholds: { ...value.thresholds },
      retention_days: this.retentionDays,
      telegram: { ...value.telegram },
      email: { ...value.email },
    };
  }

  getRetentionDays(): number {
    return this.retentionDays;
  }

  update(userId: string, patch: SettingsPatch, allowRetention = false): EditableSettings {
    const current = this.users.get(userId) ?? this.baseFor(userId);
    this.users.set(userId, mergeUser(current, patch));
    if (allowRetention && typeof patch.retention_days === "number" && patch.retention_days > 0) {
      this.retentionDays = patch.retention_days;
    }
    this.persist();
    return this.get(userId);
  }

  private baseFor(userId: string): UserEditableSettings {
    const isAdmin = this.adminUserIds.has(userId);
    return {
      thresholds: { ...this.defaults.thresholds },
      telegram: isAdmin ? { ...this.defaults.telegram } : emptyTelegram(),
      email: isAdmin ? { ...this.defaults.email } : emptyEmail(this.defaults.email),
    };
  }

  private persist(): void {
    const body: PersistedSettingsV2 = {
      version: 2,
      retention_days: this.retentionDays,
      users: Object.fromEntries(this.users),
    };
    const tmp = `${this.path}.tmp-${process.pid}`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
      renameSync(tmp, this.path);
      chmodSync(this.path, 0o600);
    } catch (err) {
      console.error("settings: write failed:", err);
    }
  }
}
