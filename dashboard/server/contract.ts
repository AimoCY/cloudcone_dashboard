import { z } from "zod";

const Proc = z.object({
  pid: z.number(),
  name: z.string(),
  cpu_pct: z.number(),
  mem_pct: z.number(),
});

export const SnapshotSchema = z.object({
  vps_id: z.string().min(1),
  label: z.string().min(1),
  ts: z.number().int(),
  uptime_sec: z.number().int().nonnegative(),
  cpu: z.object({ total_pct: z.number(), per_core: z.array(z.number()) }),
  load: z.object({ load1: z.number(), load5: z.number(), load15: z.number() }),
  mem: z.object({
    total: z.number(), used: z.number(), available: z.number(), cached: z.number(),
  }),
  swap: z.object({ total: z.number(), used: z.number() }),
  disks: z.array(z.object({
    mount: z.string(), fstype: z.string(),
    total: z.number(), used: z.number(), free: z.number(), percent: z.number(),
  })),
  disk_io: z.object({ read_bps: z.number(), write_bps: z.number() }),
  nets: z.array(z.object({
    iface: z.string(),
    rx_bps: z.number(), tx_bps: z.number(),
    rx_total: z.number(), tx_total: z.number(),
  })),
  traffic: z.object({ month: z.string(), rx_bytes: z.number(), tx_bytes: z.number() }),
  top_proc_cpu: z.array(Proc),
  top_proc_mem: z.array(Proc),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
