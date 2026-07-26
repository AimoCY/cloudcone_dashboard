import type { Hono } from "hono";
import { randomBytes, randomUUID } from "node:crypto";
import { SERIES_COLUMNS, type Db, type ManagedAgentRow, type SeriesColumn } from "./db.js";
import type { SettingsStore, SettingsPatch } from "./settings.js";
import type { AuthUser } from "./auth.js";
import { createAgentToken, createInviteCode, hashSecret } from "./secrets.js";

export interface ApiDeps {
  db: Db;
  alertSnapshot: () => Record<string, string[]>;
  settings: SettingsStore;
  nowSec?: () => number;
  onAgentDeleted?: (vps: string) => void;
}

function nowOf(deps: ApiDeps): number {
  return deps.nowSec?.() ?? Math.floor(Date.now() / 1000);
}

function agentsFor(user: AuthUser, db: Db): ManagedAgentRow[] {
  return db.getManagedAgents(user.id, user.role === "admin");
}

function agentFor(user: AuthUser, db: Db, id: string): ManagedAgentRow | undefined {
  const agent = db.getManagedAgent(id);
  if (!agent) return undefined;
  return user.role === "admin" || agent.owner_user_id === user.id ? agent : undefined;
}

function visibleAlerts(user: AuthUser, db: Db, all: Record<string, string[]>) {
  const ids = new Set(agentsFor(user, db).map((a) => a.id));
  return Object.fromEntries(Object.entries(all).filter(([vps]) => ids.has(vps)));
}

function trafficPeriod(now: number, resetDay: number): string {
  const d = new Date(now * 1000);
  if (d.getUTCDate() < resetDay) d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function publicAgent(agent: ManagedAgentRow) {
  return {
    id: agent.id,
    owner_user_id: agent.owner_user_id,
    owner_username: agent.owner_username,
    label: agent.label,
    traffic_quota_gb: agent.traffic_quota_gb,
    traffic_reset_day: agent.traffic_reset_day,
    enabled: agent.enabled,
    source: agent.source,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
  };
}

function parseAgentBody(body: Record<string, unknown>) {
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const quota = Number(body.traffic_quota_gb);
  const resetDay = Number(body.traffic_reset_day ?? 1);
  if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/u.test(label)) return null;
  if (!Number.isFinite(quota) || quota <= 0 || quota > 1_000_000) return null;
  if (!Number.isInteger(resetDay) || resetDay < 1 || resetDay > 28) return null;
  return { label, traffic_quota_gb: quota, traffic_reset_day: resetDay };
}

export function mountApi(app: Hono, deps: ApiDeps): void {
  app.get("/api/me", (c) => c.json(c.get("authUser")));

  app.get("/api/overview", (c) => {
    const user = c.get("authUser");
    const agents = agentsFor(user, deps.db).filter((a) => a.enabled);
    const overview = deps.db.getOverview();
    const alerts = deps.alertSnapshot();
    const now = nowOf(deps);
    const rows = agents.map((a) => {
      const o = overview.find((x) => x.vps_id === a.id);
      const month = trafficPeriod(now, a.traffic_reset_day);
      const traffic = deps.db.getTraffic(a.id, month) ?? { rx_bytes: 0, tx_bytes: 0 };
      const offlineSeconds = deps.settings.get(a.owner_user_id).thresholds.offline_seconds;
      const online = !!o && Math.max(0, now - o.ts) <= offlineSeconds;
      return {
        vps_id: a.id,
        label: o?.snapshot?.label ?? a.label,
        configured_label: a.label,
        owner_user_id: a.owner_user_id,
        owner_username: a.owner_username,
        traffic_quota_gb: a.traffic_quota_gb,
        traffic_reset_day: a.traffic_reset_day,
        source: a.source,
        online,
        ts: o?.ts ?? 0,
        snapshot: o?.snapshot ?? null,
        traffic_month: traffic,
        alerting: alerts[a.id] ?? [],
      };
    });
    return c.json(rows);
  });

  app.get("/api/series", (c) => {
    const user = c.get("authUser");
    const vps = c.req.query("vps") ?? "";
    const metric = c.req.query("metric") ?? "";
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!SERIES_COLUMNS.includes(metric as SeriesColumn)) {
      return c.json({ error: "unknown metric" }, 400);
    }
    if (!vps || !Number.isFinite(from) || !Number.isFinite(to)) {
      return c.json({ error: "bad query" }, 400);
    }
    if (!agentFor(user, deps.db, vps)) return c.json({ error: "not found" }, 404);
    const points = deps.db.getSeries(vps, metric as SeriesColumn, from, to);
    return c.json({ vps, metric, points });
  });

  app.get("/api/processes", (c) => {
    const user = c.get("authUser");
    const vps = c.req.query("vps") ?? "";
    if (!vps) return c.json({ error: "bad query" }, 400);
    if (!agentFor(user, deps.db, vps)) return c.json({ error: "not found" }, 404);
    return c.json(deps.db.getProcesses(vps));
  });

  app.get("/api/alerts", (c) => {
    const user = c.get("authUser");
    return c.json(visibleAlerts(user, deps.db, deps.alertSnapshot()));
  });

  app.get("/api/alert-log", (c) => {
    const user = c.get("authUser");
    const vpsIds = agentsFor(user, deps.db).map((a) => a.id);
    return c.json(deps.db.getAlertLog(120, vpsIds));
  });

  app.get("/api/agents", (c) => {
    const user = c.get("authUser");
    return c.json(agentsFor(user, deps.db).map(publicAgent));
  });

  app.post("/api/agents", async (c) => {
    const user = c.get("authUser");
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }
    const values = parseAgentBody(body);
    if (!values) return c.json({ error: "invalid agent" }, 400);
    const token = createAgentToken();
    const agent = deps.db.createManagedAgent({
      id: `vps-${randomBytes(6).toString("hex")}`,
      owner_user_id: user.id,
      token_hash: hashSecret(token),
      ...values,
    }, nowOf(deps));
    return c.json({ agent: publicAgent(agent), token }, 201);
  });

  app.put("/api/agents/:id", async (c) => {
    const user = c.get("authUser");
    const id = c.req.param("id");
    const agent = agentFor(user, deps.db, id);
    if (!agent) return c.json({ error: "not found" }, 404);
    if (agent.source !== "user") return c.json({ error: "config-managed agent" }, 409);
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }
    const values = parseAgentBody(body);
    if (!values) return c.json({ error: "invalid agent" }, 400);
    deps.db.updateManagedAgent(id, values, nowOf(deps));
    return c.json(publicAgent(deps.db.getManagedAgent(id)!));
  });

  app.post("/api/agents/:id/rotate-token", (c) => {
    const user = c.get("authUser");
    const id = c.req.param("id");
    const agent = agentFor(user, deps.db, id);
    if (!agent) return c.json({ error: "not found" }, 404);
    if (agent.source !== "user") return c.json({ error: "config-managed agent" }, 409);
    const token = createAgentToken();
    deps.db.rotateManagedAgentToken(id, hashSecret(token), nowOf(deps));
    return c.json({ token });
  });

  app.delete("/api/agents/:id", (c) => {
    const user = c.get("authUser");
    const id = c.req.param("id");
    const agent = agentFor(user, deps.db, id);
    if (!agent) return c.json({ error: "not found" }, 404);
    if (agent.source !== "user") return c.json({ error: "config-managed agent" }, 409);
    deps.db.deleteManagedAgent(id);
    deps.onAgentDeleted?.(id);
    return c.json({ ok: true });
  });

  app.get("/api/invites", (c) => {
    const user = c.get("authUser");
    if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    return c.json(deps.db.getInvites());
  });

  app.post("/api/invites", async (c) => {
    const user = c.get("authUser");
    if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    let body: Record<string, unknown> = {};
    try { body = await c.req.json(); } catch { /* default expiry */ }
    const days = Number(body.expires_in_days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return c.json({ error: "expires_in_days must be 1..30" }, 400);
    }
    const now = nowOf(deps);
    const code = createInviteCode();
    const id = randomUUID();
    const expiresAt = now + days * 86_400;
    deps.db.createInvite({
      id, code_hash: hashSecret(code), created_by: user.id, created_at: now, expires_at: expiresAt,
    });
    return c.json({ id, code, created_at: now, expires_at: expiresAt }, 201);
  });

  app.delete("/api/invites/:id", (c) => {
    const user = c.get("authUser");
    if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    return deps.db.revokeInvite(c.req.param("id"))
      ? c.json({ ok: true })
      : c.json({ error: "not found or already used" }, 404);
  });

  app.get("/api/settings", (c) => {
    const user = c.get("authUser");
    const s = deps.settings.get(user.id);
    return c.json({
      thresholds: s.thresholds,
      retention_days: s.retention_days,
      retention_editable: user.role === "admin",
      telegram: { chat_id: s.telegram.chat_id, bot_token_set: !!s.telegram.bot_token },
      email: {
        smtp_host: s.email.smtp_host,
        smtp_port: s.email.smtp_port,
        smtp_user: s.email.smtp_user,
        from: s.email.from,
        recipients: s.email.recipients,
        smtp_pass_set: !!s.email.smtp_pass,
      },
    });
  });

  app.put("/api/settings", async (c) => {
    const user = c.get("authUser");
    let body: Record<string, any>;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }
    const patch: SettingsPatch = {};
    if (body.thresholds && typeof body.thresholds === "object") {
      patch.thresholds = {};
      for (const k of ["cpu_pct", "mem_pct", "disk_pct", "traffic_pct", "offline_seconds"] as const) {
        if (typeof body.thresholds[k] === "number") patch.thresholds[k] = body.thresholds[k];
      }
    }
    if (user.role === "admin" && typeof body.retention_days === "number" && body.retention_days > 0) {
      patch.retention_days = body.retention_days;
    }
    if (body.telegram && typeof body.telegram === "object") {
      patch.telegram = {};
      if (typeof body.telegram.chat_id === "string") patch.telegram.chat_id = body.telegram.chat_id;
      if (typeof body.telegram.bot_token === "string" && body.telegram.bot_token.length > 0) {
        patch.telegram.bot_token = body.telegram.bot_token;
      }
    }
    if (body.email && typeof body.email === "object") {
      patch.email = {};
      for (const k of ["smtp_host", "smtp_user", "from", "recipients"] as const) {
        if (typeof body.email[k] === "string") patch.email[k] = body.email[k];
      }
      if (typeof body.email.smtp_port === "number") patch.email.smtp_port = body.email.smtp_port;
      if (typeof body.email.smtp_pass === "string" && body.email.smtp_pass.length > 0) {
        patch.email.smtp_pass = body.email.smtp_pass;
      }
    }
    deps.settings.update(user.id, patch, user.role === "admin");
    return c.json({ ok: true });
  });
}
