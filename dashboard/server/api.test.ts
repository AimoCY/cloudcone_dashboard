import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { mountApi } from "./api.js";
import { openDb } from "./db.js";
import { SettingsStore, type EditableSettings } from "./settings.js";
import type { Snapshot } from "./contract.js";

function snap(ts: number, cpu: number): Snapshot {
  return {
    vps_id: "vps-a", label: "VPS-A", ts, uptime_sec: 100,
    cpu: { total_pct: cpu, per_core: [cpu] },
    load: { load1: 0, load5: 0, load15: 0 },
    mem: { total: 2000, used: 1000, available: 1000, cached: 0 },
    swap: { total: 0, used: 0 },
    disks: [{ mount: "/", fstype: "ext4", total: 500, used: 250, free: 250, percent: 50 }],
    disk_io: { read_bps: 0, write_bps: 0 },
    nets: [{ iface: "eth0", rx_bps: 0, tx_bps: 0, rx_total: 0, tx_total: 0 }],
    traffic: { month: "2026-05", rx_bytes: 5_000_000_000, tx_bytes: 1_000_000_000 },
    top_proc_cpu: [{ pid: 1, name: "node", cpu_pct: cpu, mem_pct: 5 }],
    top_proc_mem: [],
  };
}

const settingsDefaults: EditableSettings = {
  thresholds: { cpu_pct: 90, mem_pct: 90, disk_pct: 90, traffic_pct: 90, offline_seconds: 60 },
  retention_days: 7,
  telegram: { bot_token: "secret-bot-token", chat_id: "123" },
  email: { smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", from: "", recipients: "" },
};

function setup() {
  const db = openDb(":memory:");
  for (let t = 1000; t < 1100; t++) db.insertSnapshot(snap(t, t % 100));
  const settings = new SettingsStore(join(mkdtempSync(join(tmpdir(), "api-")), "s.json"), settingsDefaults);
  const app = new Hono();
  mountApi(app, {
    db,
    agents: [{ id: "vps-a", label: "VPS-A", traffic_quota_gb: 10 }],
    alertSnapshot: () => ({ "vps-a": ["cpu_pct"] }),
    settings,
  });
  return { app, db, settings };
}

describe("api", () => {
  it("GET /api/overview returns each VPS with its quota and alert flags", async () => {
    const res = await setup().app.request("/api/overview");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].vps_id).toBe("vps-a");
    expect(body[0].traffic_quota_gb).toBe(10);
    expect(body[0].alerting).toContain("cpu_pct");
  });

  it("GET /api/series returns downsampled points", async () => {
    const res = await setup().app.request("/api/series?vps=vps-a&metric=cpu_pct&from=1000&to=1099");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThan(0);
  });

  it("GET /api/series rejects an unknown metric", async () => {
    const res = await setup().app.request("/api/series?vps=vps-a&metric=evil&from=0&to=9");
    expect(res.status).toBe(400);
  });

  it("GET /api/processes returns the latest top processes", async () => {
    const res = await setup().app.request("/api/processes?vps=vps-a");
    const body = await res.json();
    expect(body.cpu[0].name).toBe("node");
  });

  it("GET /api/alert-log returns stored events newest-first", async () => {
    const { app, db } = setup();
    db.appendAlertLog({ vps_id: "vps-a", metric: "cpu_pct", event: "triggered", value: 95, ts: 10 });
    const res = await app.request("/api/alert-log");
    const body = await res.json();
    expect(body[0].metric).toBe("cpu_pct");
    expect(body[0].event).toBe("triggered");
  });

  it("GET /api/settings masks the bot token", async () => {
    const res = await setup().app.request("/api/settings");
    const body = await res.json();
    expect(body.telegram.bot_token).toBeUndefined();
    expect(body.telegram.bot_token_set).toBe(true);
    expect(body.thresholds.cpu_pct).toBe(90);
  });

  it("PUT /api/settings updates thresholds and keeps the secret when omitted", async () => {
    const { app, settings } = setup();
    const res = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thresholds: { cpu_pct: 75 }, telegram: { chat_id: "999" } }),
    });
    expect(res.status).toBe(200);
    expect(settings.get().thresholds.cpu_pct).toBe(75);
    expect(settings.get().thresholds.mem_pct).toBe(90);
    expect(settings.get().telegram.chat_id).toBe("999");
    expect(settings.get().telegram.bot_token).toBe("secret-bot-token"); // unchanged
  });
});
