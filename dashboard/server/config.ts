import { readFileSync } from "node:fs";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  password_hash: z.string().min(1),
  role: z.enum(["admin", "user"]).default("user"),
});

const AgentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  token: z.string().min(1),
  traffic_quota_gb: z.number().positive(),
  traffic_reset_day: z.number().int().min(1).max(28).default(1),
  owner_user_id: z.string().min(1).optional(),
});

const RawConfigSchema = z.object({
  listen_port: z.number().int().default(8787),
  public_port: z.number().int().default(9443),
  // Legacy single-user deployments can keep admin_password_hash. New
  // deployments should use users[]. Existing configs are normalized to one
  // admin user so upgrades do not invalidate the current login.
  admin_password_hash: z.string().min(1).optional(),
  users: z.array(UserSchema).min(1).optional(),
  session_secret: z.string().min(16),
  retention_days: z.number().int().positive().default(7),
  db_path: z.string().min(1).default("./dashboard.db"),
  agents: z.array(AgentSchema).default([]),
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

type RawConfig = z.infer<typeof RawConfigSchema>;

function usersOf(cfg: RawConfig): z.infer<typeof UserSchema>[] {
  if (cfg.users) return cfg.users;
  return [{
    id: "admin",
    username: "admin",
    password_hash: cfg.admin_password_hash ?? "",
    role: "admin",
  }];
}

const ConfigSchema = RawConfigSchema.superRefine((cfg, ctx) => {
  if (!cfg.users && !cfg.admin_password_hash) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["users"],
      message: "users or admin_password_hash is required",
    });
    return;
  }

  const users = usersOf(cfg);
  const admin = users.find((u) => u.role === "admin");
  if (!admin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["users"],
      message: "at least one admin user is required",
    });
  }

  for (const field of ["id", "username"] as const) {
    const values = users.map((u) => field === "username" ? u[field].toLocaleLowerCase() : u[field]);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["users"],
        message: `duplicate user ${field}`,
      });
    }
  }

  const userIds = new Set(users.map((u) => u.id));
  for (const [i, agent] of cfg.agents.entries()) {
    const owner = agent.owner_user_id ?? admin?.id;
    if (!owner || !userIds.has(owner)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agents", i, "owner_user_id"],
        message: "agent owner_user_id must reference a configured user",
      });
    }
  }

  for (const field of ["id", "token"] as const) {
    const values = cfg.agents.map((a) => a[field]);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agents"],
        message: `duplicate agent ${field}`,
      });
    }
  }
}).transform((cfg) => {
  const users = usersOf(cfg);
  const defaultOwner = users.find((u) => u.role === "admin")!.id;
  return {
    ...cfg,
    users,
    agents: cfg.agents.map((a) => ({
      ...a,
      owner_user_id: a.owner_user_id ?? defaultOwner,
    })),
  };
});

export type DashboardConfig = z.infer<typeof ConfigSchema>;
export type DashboardUser = DashboardConfig["users"][number];
export type DashboardAgent = DashboardConfig["agents"][number];

export function loadConfig(path: string): DashboardConfig {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return ConfigSchema.parse(raw);
}
