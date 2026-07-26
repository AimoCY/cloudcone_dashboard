// Dashboard entrypoint. Wires config -> db -> ingest/api/auth -> alert engine
// with a runtime settings store, schedules background jobs, serves the frontend.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { mountIngest } from "./ingest.js";
import { mountApi } from "./api.js";
import { mountAuth, requireSession } from "./auth.js";
import { AlertEngine } from "./alerts.js";
import { SettingsStore } from "./settings.js";
import { FanoutNotifier } from "./notifier.js";
import { runRetention } from "./retention.js";
import type { Snapshot } from "./contract.js";
import { hashSecret } from "./secrets.js";

const configPath = process.env.DASHBOARD_CONFIG ?? "./dashboard.config.json";
const cfg = loadConfig(configPath);
const db = openDb(cfg.db_path);

// Config users/agents bootstrap existing installations into the database.
// User-created accounts and VPSes live only in SQLite after that.
const bootNow = Math.floor(Date.now() / 1000);
for (const user of cfg.users) db.upsertBootstrapUser(user, bootNow);
for (const agent of cfg.agents) {
  db.upsertBootstrapAgent({
    id: agent.id,
    owner_user_id: agent.owner_user_id,
    label: agent.label,
    token_hash: hashSecret(agent.token),
    traffic_quota_gb: agent.traffic_quota_gb,
    traffic_reset_day: agent.traffic_reset_day,
  }, bootNow);
}

// Runtime-editable settings: config.json supplies defaults, settings.json
// (next to the DB) holds overrides made via the Settings page.
const settings = new SettingsStore(join(dirname(cfg.db_path), "settings.json"), {
  thresholds: cfg.thresholds,
  retention_days: cfg.retention_days,
  telegram: cfg.telegram,
  email: cfg.email,
}, cfg.users.filter((u) => u.role === "admin").map((u) => u.id));

const ownerOf = (vps: string) => db.getManagedAgent(vps)?.owner_user_id;
const notifier = new FanoutNotifier(settings, ownerOf);
const alerts = new AlertEngine(
  (vps) => settings.get(ownerOf(vps)!).thresholds,
  notifier,
  (e) => db.appendAlertLog(e),
);

// Seed offline tracking from persisted latest rows. Without this, an agent
// that is already offline when the dashboard restarts is never checked until
// it has reported once again.
for (const latest of db.getOverview()) {
  if (ownerOf(latest.vps_id)) alerts.markSeen(latest.vps_id, latest.ts);
}

const quotaBytesOf = (id: string) =>
  (db.getManagedAgent(id)?.traffic_quota_gb ?? 1) * 1024 ** 3;

// Bridge an ingested snapshot into the alert engine.
function onSample(s: Snapshot): void {
  alerts.markSeen(s.vps_id, Math.floor(Date.now() / 1000));
  const memPct = s.mem.total > 0 ? (s.mem.used / s.mem.total) * 100 : 0;
  const diskPct = s.disks.reduce((m, d) => Math.max(m, d.percent), 0);
  const used = s.traffic.rx_bytes + s.traffic.tx_bytes;
  const trafficPct = (used / quotaBytesOf(s.vps_id)) * 100;
  alerts.evaluate(s.vps_id, {
    cpu_pct: s.cpu.total_pct, mem_pct: memPct, disk_pct: diskPct, traffic_pct: trafficPct,
  }, s.ts);
}

const app = new Hono();
const authConfig = { db, sessionSecret: cfg.session_secret };
mountAuth(app, authConfig);
mountIngest(app, { db, onSample });

// All /api/* routes require a session.
app.use("/api/*", requireSession(authConfig));
mountApi(app, {
  db,
  alertSnapshot: () => alerts.snapshot(),
  settings,
  onAgentDeleted: (vps) => alerts.remove(vps),
});

// Public agent self-install endpoint.
if (existsSync("./install")) {
  app.use("/install/*", serveStatic({ root: "./" }));
}

// Serve the built frontend (dashboard/web/dist) with SPA fallback.
const webDist = "./web/dist";
if (existsSync(webDist)) {
  app.use("/assets/*", serveStatic({ root: webDist }));
  app.get("*", serveStatic({ path: `${webDist}/index.html` }));
}

// Background jobs.
setInterval(() => alerts.checkOffline(Math.floor(Date.now() / 1000)), 15_000);
setInterval(() => {
  const removed = runRetention(db, settings.getRetentionDays(), Math.floor(Date.now() / 1000));
  if (removed > 0) console.log(`retention: removed ${removed} old samples`);
}, 60 * 60 * 1000);

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: cfg.listen_port }, (info) => {
  console.log(`dashboard listening on 127.0.0.1:${info.port}`);
});
