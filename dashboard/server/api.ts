import type { Hono } from "hono";
import { SERIES_COLUMNS, type Db, type SeriesColumn } from "./db.js";
import type { SettingsStore, SettingsPatch } from "./settings.js";

export interface ApiAgent { id: string; label: string; traffic_quota_gb: number; }
export interface ApiDeps {
  db: Db;
  agents: ApiAgent[];
  alertSnapshot: () => Record<string, string[]>;
  settings: SettingsStore;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// mountApi registers the read API + the runtime settings endpoints.
export function mountApi(app: Hono, deps: ApiDeps): void {
  app.get("/api/overview", (c) => {
    const overview = deps.db.getOverview();
    const alerts = deps.alertSnapshot();
    const month = currentMonth();
    const rows = deps.agents.map((a) => {
      const o = overview.find((x) => x.vps_id === a.id);
      const traffic = deps.db.getTraffic(a.id, month) ?? { rx_bytes: 0, tx_bytes: 0 };
      return {
        vps_id: a.id,
        // Prefer the agent's self-reported label (e.g. auto-detected IP);
        // fall back to the dashboard config label when the VPS is offline.
        label: o?.snapshot?.label ?? a.label,
        traffic_quota_gb: a.traffic_quota_gb,
        online: !!o,
        ts: o?.ts ?? 0,
        snapshot: o?.snapshot ?? null,
        traffic_month: traffic,
        alerting: alerts[a.id] ?? [],
      };
    });
    return c.json(rows);
  });

  app.get("/api/series", (c) => {
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
    const points = deps.db.getSeries(vps, metric as SeriesColumn, from, to);
    return c.json({ vps, metric, points });
  });

  app.get("/api/processes", (c) => {
    const vps = c.req.query("vps") ?? "";
    if (!vps) return c.json({ error: "bad query" }, 400);
    return c.json(deps.db.getProcesses(vps));
  });

  app.get("/api/alerts", (c) => c.json(deps.alertSnapshot()));

  app.get("/api/alert-log", (c) => c.json(deps.db.getAlertLog(120)));

  // Runtime-editable settings — secrets are returned only as "set" booleans.
  app.get("/api/settings", (c) => {
    const s = deps.settings.get();
    return c.json({
      thresholds: s.thresholds,
      retention_days: s.retention_days,
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
    let body: Record<string, any>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const patch: SettingsPatch = {};

    if (body.thresholds && typeof body.thresholds === "object") {
      patch.thresholds = {};
      for (const k of ["cpu_pct", "mem_pct", "disk_pct", "traffic_pct", "offline_seconds"] as const) {
        if (typeof body.thresholds[k] === "number") patch.thresholds[k] = body.thresholds[k];
      }
    }
    if (typeof body.retention_days === "number" && body.retention_days > 0) {
      patch.retention_days = body.retention_days;
    }
    if (body.telegram && typeof body.telegram === "object") {
      patch.telegram = {};
      if (typeof body.telegram.chat_id === "string") patch.telegram.chat_id = body.telegram.chat_id;
      // Secret: only overwrite when a non-empty value is supplied.
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

    deps.settings.update(patch);
    return c.json({ ok: true });
  });
}
