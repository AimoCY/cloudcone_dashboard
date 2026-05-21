import { describe, it, expect } from "vitest";
import { openDb, type Db } from "./db.js";
import type { Snapshot } from "./contract.js";

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    vps_id: "vps-a", label: "VPS-A", ts: 1000, uptime_sec: 100,
    cpu: { total_pct: 20, per_core: [20] },
    load: { load1: 0.1, load5: 0.2, load15: 0.3 },
    mem: { total: 2000, used: 800, available: 1200, cached: 300 },
    swap: { total: 1000, used: 0 },
    disks: [{ mount: "/", fstype: "ext4", total: 500, used: 200, free: 300, percent: 40 }],
    disk_io: { read_bps: 100, write_bps: 50 },
    nets: [{ iface: "eth0", rx_bps: 1, tx_bps: 2, rx_total: 9, tx_total: 8 }],
    traffic: { month: "2026-05", rx_bytes: 123, tx_bytes: 456 },
    top_proc_cpu: [{ pid: 1, name: "node", cpu_pct: 30, mem_pct: 5 }],
    top_proc_mem: [], ...over,
  };
}

function memDb(): Db { return openDb(":memory:"); }

describe("db", () => {
  it("stores a snapshot and reads it back as the latest", () => {
    const db = memDb();
    db.insertSnapshot(snap());
    const latest = db.getOverview();
    expect(latest).toHaveLength(1);
    expect(latest[0].vps_id).toBe("vps-a");
    expect(latest[0].cpu.total_pct).toBe(20);
  });

  it("getSeries returns rows within the time range", () => {
    const db = memDb();
    for (let t = 1000; t < 1010; t++) db.insertSnapshot(snap({ ts: t, cpu: { total_pct: t, per_core: [t] } }));
    const rows = db.getSeries("vps-a", "cpu_pct", 1003, 1006);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.t >= 1003 && r.t <= 1006)).toBe(true);
  });

  it("getSeries downsamples to roughly the requested bucket count", () => {
    const db = memDb();
    for (let t = 0; t < 4000; t++) db.insertSnapshot(snap({ ts: t }));
    const rows = db.getSeries("vps-a", "cpu_pct", 0, 3999, 100);
    expect(rows.length).toBeLessThanOrEqual(110);
    expect(rows.length).toBeGreaterThan(50);
  });

  it("getProcesses returns the latest top processes", () => {
    const db = memDb();
    db.insertSnapshot(snap({ ts: 1, top_proc_cpu: [{ pid: 9, name: "x", cpu_pct: 1, mem_pct: 1 }] }));
    db.insertSnapshot(snap({ ts: 2, top_proc_cpu: [{ pid: 7, name: "y", cpu_pct: 2, mem_pct: 2 }] }));
    expect(db.getProcesses("vps-a").cpu[0].pid).toBe(7);
  });

  it("deleteOlderThan removes stale samples only", () => {
    const db = memDb();
    db.insertSnapshot(snap({ ts: 100 }));
    db.insertSnapshot(snap({ ts: 5000 }));
    const removed = db.deleteOlderThan(1000);
    expect(removed).toBe(1);
    expect(db.getSeries("vps-a", "cpu_pct", 0, 9999).length).toBe(1);
  });

  it("stores monthly traffic and overwrites the same month", () => {
    const db = memDb();
    db.insertSnapshot(snap({ traffic: { month: "2026-05", rx_bytes: 100, tx_bytes: 100 } }));
    db.insertSnapshot(snap({ ts: 1001, traffic: { month: "2026-05", rx_bytes: 200, tx_bytes: 250 } }));
    expect(db.getTraffic("vps-a", "2026-05")).toEqual({ rx_bytes: 200, tx_bytes: 250 });
  });

  it("appends and reads back alert log events newest-first", () => {
    const db = memDb();
    db.appendAlertLog({ vps_id: "vps-a", metric: "cpu_pct", event: "triggered", value: 95, ts: 100 });
    db.appendAlertLog({ vps_id: "vps-a", metric: "cpu_pct", event: "recovered", value: 40, ts: 200 });
    const log = db.getAlertLog(10);
    expect(log).toHaveLength(2);
    expect(log[0].ts).toBe(200);
    expect(log[0].event).toBe("recovered");
  });
});
