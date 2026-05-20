export interface Proc { pid: number; name: string; cpu_pct: number; mem_pct: number; }

export interface Snapshot {
  vps_id: string; label: string; ts: number; uptime_sec: number;
  cpu: { total_pct: number; per_core: number[] };
  load: { load1: number; load5: number; load15: number };
  mem: { total: number; used: number; available: number; cached: number };
  swap: { total: number; used: number };
  disks: { mount: string; fstype: string; total: number; used: number; free: number; percent: number }[];
  disk_io: { read_bps: number; write_bps: number };
  nets: { iface: string; rx_bps: number; tx_bps: number; rx_total: number; tx_total: number }[];
  traffic: { month: string; rx_bytes: number; tx_bytes: number };
  top_proc_cpu: Proc[]; top_proc_mem: Proc[];
}

export interface OverviewRow {
  vps_id: string; label: string; traffic_quota_gb: number;
  online: boolean; ts: number;
  snapshot: Snapshot | null;
  traffic_month: { rx_bytes: number; tx_bytes: number };
  alerting: string[];
}

export interface SeriesResponse {
  vps: string; metric: string; points: { t: number; v: number }[];
}

export type SeriesMetric =
  | "cpu_pct" | "load1" | "mem_used" | "swap_used"
  | "disk_read_bps" | "disk_write_bps" | "net_rx_bps" | "net_tx_bps" | "disk_pct_max";
