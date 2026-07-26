import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { mountIngest } from "./ingest.js";
import { openDb } from "./db.js";
import type { Snapshot } from "./contract.js";
import { hashSecret } from "./secrets.js";

function payload(over: Partial<Snapshot> = {}): Snapshot {
  return {
    vps_id: "vps-a", label: "VPS-A", ts: 1000, uptime_sec: 100,
    cpu: { total_pct: 95, per_core: [95] },
    load: { load1: 1, load5: 1, load15: 1 },
    mem: { total: 2000, used: 200, available: 1800, cached: 100 },
    swap: { total: 0, used: 0 },
    disks: [{ mount: "/", fstype: "ext4", total: 500, used: 50, free: 450, percent: 10 }],
    disk_io: { read_bps: 0, write_bps: 0 },
    nets: [{ iface: "eth0", rx_bps: 0, tx_bps: 0, rx_total: 0, tx_total: 0 }],
    traffic: { month: "2026-05", rx_bytes: 0, tx_bytes: 0 },
    top_proc_cpu: [], top_proc_mem: [], ...over,
  };
}

function setup() {
  const db = openDb(":memory:");
  db.upsertBootstrapUser({
    id: "admin", username: "admin", password_hash: "hash", role: "admin",
  }, 1);
  db.upsertBootstrapAgent({
    id: "vps-a", owner_user_id: "admin", label: "VPS-A",
    token_hash: hashSecret("tok-a"), traffic_quota_gb: 1000, traffic_reset_day: 1,
  }, 1);
  db.upsertBootstrapAgent({
    id: "vps-b", owner_user_id: "admin", label: "VPS-B",
    token_hash: hashSecret("tok-b"), traffic_quota_gb: 1000, traffic_reset_day: 1,
  }, 1);
  const onSample = vi.fn();
  const app = new Hono();
  mountIngest(app, { db, onSample });
  return { app, db, onSample };
}

describe("ingest", () => {
  it("rejects a request with no bearer token", async () => {
    const { app } = setup();
    const res = await app.request("/ingest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const { app } = setup();
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify(payload()),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a token that belongs to a different vps_id", async () => {
    const { app } = setup();
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok-b" },
      body: JSON.stringify(payload({ vps_id: "vps-a" })),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed payload with 400", async () => {
    const { app } = setup();
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok-a" },
      body: JSON.stringify({ vps_id: "vps-a" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid payload, stores it, and invokes onSample", async () => {
    const { app, db, onSample } = setup();
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok-a" },
      body: JSON.stringify(payload()),
    });
    expect(res.status).toBe(200);
    expect(db.getOverview()).toHaveLength(1);
    expect(onSample).toHaveBeenCalledOnce();
  });
});
