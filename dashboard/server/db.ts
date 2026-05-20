import Database from "better-sqlite3";
import type { Snapshot } from "./contract.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS samples (
  vps_id TEXT NOT NULL, ts INTEGER NOT NULL,
  cpu_pct REAL, load1 REAL, load5 REAL, load15 REAL,
  mem_used INTEGER, mem_total INTEGER, mem_cached INTEGER, mem_available INTEGER,
  swap_used INTEGER, swap_total INTEGER,
  disk_read_bps INTEGER, disk_write_bps INTEGER,
  net_rx_bps INTEGER, net_tx_bps INTEGER,
  disk_pct_max REAL, uptime_sec INTEGER,
  cpu_per_core TEXT, disks TEXT, nets TEXT,
  PRIMARY KEY (vps_id, ts)
);
CREATE TABLE IF NOT EXISTS latest (
  vps_id TEXT PRIMARY KEY, ts INTEGER, label TEXT,
  snapshot TEXT, top_proc_cpu TEXT, top_proc_mem TEXT
);
CREATE TABLE IF NOT EXISTS monthly_traffic (
  vps_id TEXT NOT NULL, month TEXT NOT NULL,
  rx_bytes INTEGER, tx_bytes INTEGER,
  PRIMARY KEY (vps_id, month)
);
CREATE TABLE IF NOT EXISTS alert_state (
  vps_id TEXT NOT NULL, metric TEXT NOT NULL,
  state TEXT NOT NULL, since INTEGER, last_notified INTEGER,
  consecutive INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vps_id, metric)
);
CREATE TABLE IF NOT EXISTS alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id TEXT, metric TEXT, event TEXT, value REAL, ts INTEGER
);
`;

// Numeric series columns clients may request.
export const SERIES_COLUMNS = [
  "cpu_pct", "load1", "load5", "load15",
  "mem_used", "swap_used", "disk_read_bps", "disk_write_bps",
  "net_rx_bps", "net_tx_bps", "disk_pct_max",
] as const;
export type SeriesColumn = (typeof SERIES_COLUMNS)[number];

export interface OverviewRow {
  vps_id: string; label: string; ts: number; snapshot: Snapshot;
  cpu: { total_pct: number };
}
export interface SeriesPoint { t: number; v: number; }

export interface Db {
  insertSnapshot(s: Snapshot): void;
  getOverview(): OverviewRow[];
  getSeries(vps: string, col: SeriesColumn, from: number, to: number, buckets?: number): SeriesPoint[];
  getProcesses(vps: string): { cpu: Snapshot["top_proc_cpu"]; mem: Snapshot["top_proc_mem"] };
  getTraffic(vps: string, month: string): { rx_bytes: number; tx_bytes: number } | null;
  deleteOlderThan(cutoffTs: number): number;
  raw: Database.Database;
}

export function openDb(path: string): Db {
  const sql = new Database(path);
  sql.pragma("journal_mode = WAL");
  sql.exec(SCHEMA);

  const insSample = sql.prepare(`
    INSERT OR REPLACE INTO samples
    (vps_id, ts, cpu_pct, load1, load5, load15, mem_used, mem_total, mem_cached,
     mem_available, swap_used, swap_total, disk_read_bps, disk_write_bps,
     net_rx_bps, net_tx_bps, disk_pct_max, uptime_sec, cpu_per_core, disks, nets)
    VALUES (@vps_id,@ts,@cpu_pct,@load1,@load5,@load15,@mem_used,@mem_total,
     @mem_cached,@mem_available,@swap_used,@swap_total,@disk_read_bps,
     @disk_write_bps,@net_rx_bps,@net_tx_bps,@disk_pct_max,@uptime_sec,
     @cpu_per_core,@disks,@nets)`);
  const insLatest = sql.prepare(`
    INSERT OR REPLACE INTO latest (vps_id, ts, label, snapshot, top_proc_cpu, top_proc_mem)
    VALUES (@vps_id,@ts,@label,@snapshot,@top_proc_cpu,@top_proc_mem)`);
  const insTraffic = sql.prepare(`
    INSERT OR REPLACE INTO monthly_traffic (vps_id, month, rx_bytes, tx_bytes)
    VALUES (@vps_id,@month,@rx_bytes,@tx_bytes)`);

  function insertSnapshot(s: Snapshot): void {
    const diskPctMax = s.disks.reduce((m, d) => Math.max(m, d.percent), 0);
    const netRx = s.nets.reduce((a, n) => a + n.rx_bps, 0);
    const netTx = s.nets.reduce((a, n) => a + n.tx_bps, 0);
    const tx = sql.transaction(() => {
      insSample.run({
        vps_id: s.vps_id, ts: s.ts, cpu_pct: s.cpu.total_pct,
        load1: s.load.load1, load5: s.load.load5, load15: s.load.load15,
        mem_used: s.mem.used, mem_total: s.mem.total, mem_cached: s.mem.cached,
        mem_available: s.mem.available, swap_used: s.swap.used, swap_total: s.swap.total,
        disk_read_bps: s.disk_io.read_bps, disk_write_bps: s.disk_io.write_bps,
        net_rx_bps: netRx, net_tx_bps: netTx, disk_pct_max: diskPctMax,
        uptime_sec: s.uptime_sec,
        cpu_per_core: JSON.stringify(s.cpu.per_core),
        disks: JSON.stringify(s.disks), nets: JSON.stringify(s.nets),
      });
      insLatest.run({
        vps_id: s.vps_id, ts: s.ts, label: s.label,
        snapshot: JSON.stringify(s),
        top_proc_cpu: JSON.stringify(s.top_proc_cpu),
        top_proc_mem: JSON.stringify(s.top_proc_mem),
      });
      insTraffic.run({
        vps_id: s.vps_id, month: s.traffic.month,
        rx_bytes: s.traffic.rx_bytes, tx_bytes: s.traffic.tx_bytes,
      });
    });
    tx();
  }

  function getOverview(): OverviewRow[] {
    const rows = sql.prepare(`SELECT vps_id, label, ts, snapshot FROM latest`).all() as
      { vps_id: string; label: string; ts: number; snapshot: string }[];
    return rows.map((r) => {
      const snapshot = JSON.parse(r.snapshot) as Snapshot;
      return { vps_id: r.vps_id, label: r.label, ts: r.ts, snapshot, cpu: { total_pct: snapshot.cpu.total_pct } };
    });
  }

  function getSeries(vps: string, col: SeriesColumn, from: number, to: number, buckets = 1000): SeriesPoint[] {
    if (!SERIES_COLUMNS.includes(col)) throw new Error(`invalid series column: ${col}`);
    const span = Math.max(1, to - from);
    const bucket = Math.max(1, Math.floor(span / buckets));
    // GROUP BY integer time bucket; average the metric within each bucket.
    const stmt = sql.prepare(
      `SELECT (ts / ${bucket}) * ${bucket} AS t, AVG(${col}) AS v
       FROM samples WHERE vps_id = ? AND ts BETWEEN ? AND ?
       GROUP BY t ORDER BY t`);
    return stmt.all(vps, from, to) as SeriesPoint[];
  }

  function getProcesses(vps: string) {
    const row = sql.prepare(`SELECT top_proc_cpu, top_proc_mem FROM latest WHERE vps_id = ?`)
      .get(vps) as { top_proc_cpu: string; top_proc_mem: string } | undefined;
    if (!row) return { cpu: [], mem: [] };
    return { cpu: JSON.parse(row.top_proc_cpu), mem: JSON.parse(row.top_proc_mem) };
  }

  function getTraffic(vps: string, month: string) {
    const row = sql.prepare(`SELECT rx_bytes, tx_bytes FROM monthly_traffic WHERE vps_id = ? AND month = ?`)
      .get(vps, month) as { rx_bytes: number; tx_bytes: number } | undefined;
    return row ?? null;
  }

  function deleteOlderThan(cutoffTs: number): number {
    return sql.prepare(`DELETE FROM samples WHERE ts < ?`).run(cutoffTs).changes;
  }

  return { insertSnapshot, getOverview, getSeries, getProcesses, getTraffic, deleteOlderThan, raw: sql };
}
