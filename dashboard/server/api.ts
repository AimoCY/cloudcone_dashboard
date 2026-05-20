import type { Hono } from "hono";
import { SERIES_COLUMNS, type Db, type SeriesColumn } from "./db.js";

export interface ApiAgent { id: string; label: string; traffic_quota_gb: number; }
export interface ApiDeps {
  db: Db;
  agents: ApiAgent[];
  alertSnapshot: () => Record<string, string[]>;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// mountApi registers GET /api/overview, /api/series, /api/processes, /api/alerts.
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
        label: a.label,
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
}
