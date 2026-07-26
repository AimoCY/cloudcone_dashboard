export interface Proc { pid: number; name: string; cpu_pct: number; mem_pct: number; }

export interface CurrentUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

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
  configured_label: string;
  owner_user_id: string;
  owner_username: string;
  traffic_reset_day: number;
  source: "config" | "user";
  online: boolean; ts: number;
  snapshot: Snapshot | null;
  traffic_month: { rx_bytes: number; tx_bytes: number };
  alerting: string[];
}

export interface ManagedAgent {
  id: string;
  owner_user_id: string;
  owner_username: string;
  label: string;
  traffic_quota_gb: number;
  traffic_reset_day: number;
  enabled: boolean;
  source: "config" | "user";
  created_at: number;
  updated_at: number;
}

export interface Invite {
  id: string;
  created_by: string;
  created_by_username: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: string | null;
  used_by_username: string | null;
}

export interface SeriesResponse {
  vps: string; metric: string; points: { t: number; v: number }[];
}

export type SeriesMetric =
  | "cpu_pct" | "load1" | "mem_used" | "swap_used"
  | "disk_read_bps" | "disk_write_bps" | "net_rx_bps" | "net_tx_bps" | "disk_pct_max";

export interface AlertLogRow {
  id: number;
  vps_id: string;
  metric: string;
  event: "triggered" | "recovered";
  value: number;
  ts: number;
}

export interface Thresholds {
  cpu_pct: number; mem_pct: number; disk_pct: number;
  traffic_pct: number; offline_seconds: number;
}

export interface SettingsView {
  thresholds: Thresholds;
  retention_days: number;
  retention_editable: boolean;
  telegram: { chat_id: string; bot_token_set: boolean };
  email: {
    smtp_host: string; smtp_port: number; smtp_user: string;
    from: string; recipients: string; smtp_pass_set: boolean;
  };
}

export interface SettingsPatch {
  thresholds?: Partial<Thresholds>;
  retention_days?: number;
  telegram?: { chat_id?: string; bot_token?: string };
  email?: {
    smtp_host?: string; smtp_port?: number; smtp_user?: string;
    smtp_pass?: string; from?: string; recipients?: string;
  };
}
