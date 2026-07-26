import { describe, it, expect } from "vitest";
import { openDb } from "./db.js";
import { runRetention } from "./retention.js";
import type { Snapshot } from "./contract.js";

function snap(ts: number): Snapshot {
  return {
    vps_id: "vps-a", label: "VPS-A", ts, uptime_sec: 1,
    cpu: { total_pct: 1, per_core: [1] },
    load: { load1: 0, load5: 0, load15: 0 },
    mem: { total: 1, used: 1, available: 0, cached: 0 },
    swap: { total: 0, used: 0 }, disks: [], disk_io: { read_bps: 0, write_bps: 0 },
    nets: [], traffic: { month: "2026-05", rx_bytes: 0, tx_bytes: 0 },
    top_proc_cpu: [], top_proc_mem: [],
  };
}

describe("runRetention", () => {
  it("deletes samples older than retentionDays relative to now", () => {
    const db = openDb(":memory:");
    const now = 10_000_000;
    const day = 86_400;
    db.insertSnapshot(snap(now - 8 * day)); // older than 7 days -> deleted
    db.insertSnapshot(snap(now - 1 * day)); // kept
    const removed = runRetention(db, 7, now);
    expect(removed).toBe(1);
    expect(db.getSeries("vps-a", "cpu_pct", 0, now).length).toBe(1);
  });
});
