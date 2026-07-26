import { describe, it, expect } from "vitest";
import { SnapshotSchema } from "./contract.js";

const valid = {
  vps_id: "vps-a", label: "VPS-A", ts: 1716200000, uptime_sec: 100,
  cpu: { total_pct: 12.5, per_core: [10, 15] },
  load: { load1: 0.3, load5: 0.4, load15: 0.5 },
  mem: { total: 2000, used: 800, available: 1200, cached: 300 },
  swap: { total: 1000, used: 0 },
  disks: [{ mount: "/", fstype: "ext4", total: 500, used: 200, free: 300, percent: 40 }],
  disk_io: { read_bps: 100, write_bps: 50 },
  nets: [{ iface: "eth0", rx_bps: 1, tx_bps: 2, rx_total: 9, tx_total: 8 }],
  traffic: { month: "2026-05", rx_bytes: 123, tx_bytes: 456 },
  top_proc_cpu: [{ pid: 1, name: "node", cpu_pct: 30, mem_pct: 5 }],
  top_proc_mem: [],
};

describe("SnapshotSchema", () => {
  it("accepts a valid payload", () => {
    expect(SnapshotSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a missing required field", () => {
    const { vps_id, ...rest } = valid;
    expect(SnapshotSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects a wrong-typed field", () => {
    expect(SnapshotSchema.safeParse({ ...valid, ts: "nope" }).success).toBe(false);
  });
  it("accepts empty arrays for disks/nets/procs", () => {
    const r = SnapshotSchema.safeParse({ ...valid, disks: [], nets: [], top_proc_cpu: [] });
    expect(r.success).toBe(true);
  });
});
