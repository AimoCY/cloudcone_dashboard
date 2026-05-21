import { readFileSync } from "node:fs";
import { z } from "zod";

const ConfigSchema = z.object({
  listen_port: z.number().int().default(8787),
  public_port: z.number().int().default(9443),
  admin_password_hash: z.string().min(1),
  session_secret: z.string().min(16),
  retention_days: z.number().int().positive().default(7),
  db_path: z.string().min(1).default("./dashboard.db"),
  agents: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    token: z.string().min(1),
    traffic_quota_gb: z.number().positive(),
  })).min(1),
  thresholds: z.object({
    cpu_pct: z.number().default(90),
    mem_pct: z.number().default(90),
    disk_pct: z.number().default(90),
    traffic_pct: z.number().default(90),
    offline_seconds: z.number().int().default(60),
  }),
  telegram: z.object({
    bot_token: z.string(),
    chat_id: z.string(),
  }),
  email: z.object({
    smtp_host: z.string().default(""),
    smtp_port: z.number().int().default(587),
    smtp_user: z.string().default(""),
    smtp_pass: z.string().default(""),
    from: z.string().default(""),
    recipients: z.string().default(""),
  }).default({}),
});

export type DashboardConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): DashboardConfig {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return ConfigSchema.parse(raw);
}
