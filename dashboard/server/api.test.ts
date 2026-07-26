import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { mountApi } from "./api.js";
import { openDb } from "./db.js";
import { SettingsStore, type EditableSettings } from "./settings.js";
import type { Snapshot } from "./contract.js";
import type { AuthUser } from "./auth.js";
import { hashSecret } from "./secrets.js";

const ADMIN: AuthUser = { id: "admin", username: "admin", role: "admin" };
const ALICE: AuthUser = { id: "alice", username: "alice", role: "user" };

function snap(ts: number, cpu: number, vps = "vps-a"): Snapshot {
  return {
    vps_id: vps, label: vps === "vps-a" ? "VPS-A" : "VPS-B", ts, uptime_sec: 100,
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

function setup(user: AuthUser = ADMIN, now = 1100) {
  const db = openDb(":memory:");
  db.upsertBootstrapUser({
    id: "admin", username: "admin", password_hash: "admin-hash", role: "admin",
  }, 1);
  db.upsertBootstrapUser({
    id: "alice", username: "alice", password_hash: "alice-hash", role: "user",
  }, 2);
  db.upsertBootstrapAgent({
    id: "vps-a", owner_user_id: "admin", label: "VPS-A", token_hash: hashSecret("token-a"),
    traffic_quota_gb: 10, traffic_reset_day: 1,
  }, 3);
  db.upsertBootstrapAgent({
    id: "vps-b", owner_user_id: "alice", label: "VPS-B", token_hash: hashSecret("token-b"),
    traffic_quota_gb: 20, traffic_reset_day: 1,
  }, 4);
  for (let t = 1000; t < 1100; t++) db.insertSnapshot(snap(t, t % 100));
  db.insertSnapshot(snap(1099, 25, "vps-b"));
  const settings = new SettingsStore(
    join(mkdtempSync(join(tmpdir(), "api-")), "s.json"), settingsDefaults, ["admin"],
  );
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.set("authUser", user);
    await next();
  });
  mountApi(app, {
    db,
    alertSnapshot: () => ({ "vps-a": ["cpu_pct"], "vps-b": ["disk_pct"] }),
    settings,
    nowSec: () => now,
  });
  return { app, db, settings };
}

describe("api tenant isolation", () => {
  it("GET /api/me returns the authenticated identity", async () => {
    const res = await setup(ALICE).app.request("/api/me");
    expect(await res.json()).toEqual(ALICE);
  });

  it("admin overview sees all VPSes", async () => {
    const res = await setup().app.request("/api/overview");
    const body = await res.json();
    expect(body.map((r: any) => r.vps_id)).toEqual(["vps-a", "vps-b"]);
    expect(body.every((r: any) => r.online)).toBe(true);
  });

  it("normal-user overview contains only owned VPSes and filters alert state", async () => {
    const res = await setup(ALICE).app.request("/api/overview");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].vps_id).toBe("vps-b");
    expect(body[0].alerting).toEqual(["disk_pct"]);

    const alerts = await setup(ALICE).app.request("/api/alerts");
    expect(await alerts.json()).toEqual({ "vps-b": ["disk_pct"] });
  });

  it("marks a persisted but stale latest sample offline", async () => {
    const res = await setup(ADMIN, 1200).app.request("/api/overview");
    const body = await res.json();
    expect(body.every((r: any) => !r.online)).toBe(true);
  });

  it("rejects series and process access to another user's VPS", async () => {
    const { app } = setup(ALICE);
    const deniedSeries = await app.request("/api/series?vps=vps-a&metric=cpu_pct&from=1000&to=1099");
    const deniedProcesses = await app.request("/api/processes?vps=vps-a");
    expect(deniedSeries.status).toBe(404);
    expect(deniedProcesses.status).toBe(404);

    const own = await app.request("/api/series?vps=vps-b&metric=cpu_pct&from=1000&to=1099");
    expect(own.status).toBe(200);
  });

  it("GET /api/series rejects an unknown metric", async () => {
    const res = await setup().app.request("/api/series?vps=vps-a&metric=evil&from=0&to=9");
    expect(res.status).toBe(400);
  });

  it("alert log returns only events for visible VPSes", async () => {
    const { app, db } = setup(ALICE);
    db.appendAlertLog({ vps_id: "vps-a", metric: "cpu_pct", event: "triggered", value: 95, ts: 10 });
    db.appendAlertLog({ vps_id: "vps-b", metric: "disk_pct", event: "triggered", value: 96, ts: 20 });
    const res = await app.request("/api/alert-log");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].vps_id).toBe("vps-b");
  });

  it("GET /api/settings masks secrets and exposes retention permission", async () => {
    const admin = await (await setup().app.request("/api/settings")).json();
    expect(admin.telegram.bot_token).toBeUndefined();
    expect(admin.telegram.bot_token_set).toBe(true);
    expect(admin.retention_editable).toBe(true);

    const alice = await (await setup(ALICE).app.request("/api/settings")).json();
    expect(alice.telegram.bot_token_set).toBe(false);
    expect(alice.retention_editable).toBe(false);
  });

  it("PUT /api/settings updates only the current user's settings", async () => {
    const { app, settings } = setup(ALICE);
    const res = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thresholds: { cpu_pct: 75 },
        telegram: { chat_id: "999", bot_token: "alice-secret" },
        retention_days: 30,
      }),
    });
    expect(res.status).toBe(200);
    expect(settings.get("alice").thresholds.cpu_pct).toBe(75);
    expect(settings.get("alice").telegram.chat_id).toBe("999");
    expect(settings.get("admin").thresholds.cpu_pct).toBe(90);
    expect(settings.getRetentionDays()).toBe(7);
  });

  it("admin can update global retention without losing existing secrets", async () => {
    const { app, settings } = setup();
    await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thresholds: { cpu_pct: 75 }, telegram: { chat_id: "999" }, retention_days: 14 }),
    });
    expect(settings.get("admin").thresholds.cpu_pct).toBe(75);
    expect(settings.get("admin").telegram.chat_id).toBe("999");
    expect(settings.get("admin").telegram.bot_token).toBe("secret-bot-token");
    expect(settings.getRetentionDays()).toBe(14);
  });

  it("lets a user create and manage only a self-owned dynamic VPS", async () => {
    const { app, db } = setup(ALICE);
    const created = await app.request("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Alice Tokyo", traffic_quota_gb: 500, traffic_reset_day: 15 }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.agent).toMatchObject({ owner_user_id: "alice", label: "Alice Tokyo", source: "user" });
    expect(body.token.length).toBeGreaterThan(30);
    expect(db.getManagedAgentByTokenHash(hashSecret(body.token))?.id).toBe(body.agent.id);

    const updated = await app.request(`/api/agents/${body.agent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Alice Osaka", traffic_quota_gb: 600, traffic_reset_day: 10 }),
    });
    expect((await updated.json()).label).toBe("Alice Osaka");

    const rotated = await app.request(`/api/agents/${body.agent.id}/rotate-token`, { method: "POST" });
    const rotatedBody = await rotated.json();
    expect(rotatedBody.token).not.toBe(body.token);
    expect(db.getManagedAgentByTokenHash(hashSecret(body.token))).toBeUndefined();

    const removed = await app.request(`/api/agents/${body.agent.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(db.getManagedAgent(body.agent.id)).toBeUndefined();
  });

  it("rejects multi-line labels that cannot safely become agent configuration", async () => {
    const { app } = setup(ALICE);
    const res = await app.request("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Tokyo\nextra: value", traffic_quota_gb: 500, traffic_reset_day: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("does not let users rotate or delete config-managed or foreign VPSes", async () => {
    const { app } = setup(ALICE);
    expect((await app.request("/api/agents/vps-a/rotate-token", { method: "POST" })).status).toBe(404);
    expect((await app.request("/api/agents/vps-b/rotate-token", { method: "POST" })).status).toBe(409);
    expect((await app.request("/api/agents/vps-b", { method: "DELETE" })).status).toBe(409);
  });

  it("allows only admins to generate, list, and revoke one-time invites", async () => {
    const admin = setup();
    const created = await admin.app.request("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_days: 3 }),
    });
    expect(created.status).toBe(201);
    const invite = await created.json();
    expect(invite.code).toMatch(/-/);
    expect(admin.db.getInvites()).toHaveLength(1);
    expect((await admin.app.request(`/api/invites/${invite.id}`, { method: "DELETE" })).status).toBe(200);

    const alice = setup(ALICE);
    expect((await alice.app.request("/api/invites")).status).toBe(403);
    expect((await alice.app.request("/api/invites", { method: "POST" })).status).toBe(403);
  });
});
