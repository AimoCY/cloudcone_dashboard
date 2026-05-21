// Display formatting helpers.
export const GB = 1024 ** 3;

export function fmtBps(bps: number): string {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} M/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} K/s`;
  return `${Math.round(bps)} B/s`;
}

export function gb(bytes: number): number {
  return bytes / GB;
}

export function fmtTraffic(bytes: number): string {
  const g = bytes / GB;
  if (g >= 1024) return `${(g / 1024).toFixed(2)} TB`;
  if (g >= 10) return `${g.toFixed(0)} GB`;
  return `${g.toFixed(1)} GB`;
}

export function uptimeStr(sec: number): string {
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// Returns "", "warn" or "bad" for a 0–100 value against two cutoffs.
export function tone(value: number, warn: number, bad: number): string {
  return value >= bad ? "bad" : value >= warn ? "warn" : "";
}

export function memPct(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

const METRIC_LABELS: Record<string, string> = {
  cpu_pct: "CPU", mem_pct: "内存", disk_pct: "磁盘",
  traffic_pct: "流量", offline: "在线状态",
};
export function metricLabel(m: string): string {
  return METRIC_LABELS[m] ?? m;
}

export function fmtTime(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
