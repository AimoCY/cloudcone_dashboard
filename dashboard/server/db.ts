import Database from "better-sqlite3";
import type { Snapshot } from "./contract.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(used_at, expires_at);
CREATE TABLE IF NOT EXISTS managed_agents (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  traffic_quota_gb REAL NOT NULL,
  traffic_reset_day INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('config', 'user')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_managed_agents_owner ON managed_agents(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_managed_agents_token ON managed_agents(token_hash);
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

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  active: boolean;
  created_at: number;
}

export interface ManagedAgentRow {
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

export interface InviteRow {
  id: string;
  created_by: string;
  created_by_username: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: string | null;
  used_by_username: string | null;
}

export type RegistrationResult = "ok" | "username_taken" | "invalid_invite";

export interface OverviewRow {
  vps_id: string; label: string; ts: number; snapshot: Snapshot;
  cpu: { total_pct: number };
}
export interface SeriesPoint { t: number; v: number; }

export interface AlertLogRow {
  id: number; vps_id: string; metric: string; event: string; value: number; ts: number;
}

export interface Db {
  upsertBootstrapUser(user: Pick<UserRow, "id" | "username" | "password_hash" | "role">, now: number): void;
  getUserByUsername(username: string): UserRow | undefined;
  getUserById(id: string): UserRow | undefined;
  getFirstAdmin(): UserRow | undefined;
  hasUsableInvite(codeHash: string, now: number): boolean;
  registerUserWithInvite(input: {
    id: string; username: string; password_hash: string; invite_code_hash: string; now: number;
  }): RegistrationResult;
  createInvite(input: {
    id: string; code_hash: string; created_by: string; created_at: number; expires_at: number;
  }): void;
  getInvites(limit?: number): InviteRow[];
  revokeInvite(id: string): boolean;
  upsertBootstrapAgent(agent: {
    id: string; owner_user_id: string; label: string; token_hash: string;
    traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): void;
  getManagedAgents(userId: string, includeAll: boolean): ManagedAgentRow[];
  getManagedAgent(id: string): ManagedAgentRow | undefined;
  getManagedAgentByTokenHash(tokenHash: string): ManagedAgentRow | undefined;
  createManagedAgent(agent: {
    id: string; owner_user_id: string; label: string; token_hash: string;
    traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): ManagedAgentRow;
  updateManagedAgent(id: string, patch: {
    label: string; traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): boolean;
  rotateManagedAgentToken(id: string, tokenHash: string, now: number): boolean;
  deleteManagedAgent(id: string): boolean;
  insertSnapshot(s: Snapshot): void;
  getOverview(): OverviewRow[];
  getSeries(vps: string, col: SeriesColumn, from: number, to: number, buckets?: number): SeriesPoint[];
  getProcesses(vps: string): { cpu: Snapshot["top_proc_cpu"]; mem: Snapshot["top_proc_mem"] };
  getTraffic(vps: string, month: string): { rx_bytes: number; tx_bytes: number } | null;
  deleteOlderThan(cutoffTs: number): number;
  appendAlertLog(e: Omit<AlertLogRow, "id">): void;
  getAlertLog(limit: number, vpsIds?: string[]): AlertLogRow[];
  raw: Database.Database;
}

export function openDb(path: string): Db {
  const sql = new Database(path);
  sql.pragma("journal_mode = WAL");
  sql.pragma("foreign_keys = ON");
  sql.exec(SCHEMA);

  const toUser = (row: any): UserRow | undefined => row ? { ...row, active: !!row.active } : undefined;
  const toAgent = (row: any): ManagedAgentRow | undefined => row ? { ...row, enabled: !!row.enabled } : undefined;
  const agentSelect = `
    SELECT a.id, a.owner_user_id, u.username AS owner_username, a.label,
           a.traffic_quota_gb, a.traffic_reset_day, a.enabled, a.source,
           a.created_at, a.updated_at
    FROM managed_agents a JOIN users u ON u.id = a.owner_user_id`;

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
  const insAlert = sql.prepare(`
    INSERT INTO alert_log (vps_id, metric, event, value, ts)
    VALUES (@vps_id,@metric,@event,@value,@ts)`);

  function upsertBootstrapUser(
    user: Pick<UserRow, "id" | "username" | "password_hash" | "role">,
    now: number,
  ): void {
    sql.prepare(`
      INSERT INTO users (id, username, password_hash, role, active, created_at)
      VALUES (@id, @username, @password_hash, @role, 1, @now)
      ON CONFLICT(id) DO UPDATE SET
        username=excluded.username, password_hash=excluded.password_hash,
        role=excluded.role, active=1
    `).run({ ...user, now });
  }

  function getUserByUsername(username: string): UserRow | undefined {
    return toUser(sql.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1`).get(username));
  }

  function getUserById(id: string): UserRow | undefined {
    return toUser(sql.prepare(`SELECT * FROM users WHERE id = ? AND active = 1`).get(id));
  }

  function getFirstAdmin(): UserRow | undefined {
    return toUser(sql.prepare(`
      SELECT * FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at, id LIMIT 1
    `).get());
  }

  const registerTx = sql.transaction((input: {
    id: string; username: string; password_hash: string; invite_code_hash: string; now: number;
  }): RegistrationResult => {
    const invite = sql.prepare(`
      SELECT id FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(input.invite_code_hash, input.now) as { id: string } | undefined;
    if (!invite) return "invalid_invite";
    const existing = sql.prepare(`SELECT 1 FROM users WHERE username = ? COLLATE NOCASE`).get(input.username);
    if (existing) return "username_taken";
    sql.prepare(`
      INSERT INTO users (id, username, password_hash, role, active, created_at)
      VALUES (?, ?, ?, 'user', 1, ?)
    `).run(input.id, input.username, input.password_hash, input.now);
    sql.prepare(`UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL`)
      .run(input.now, input.id, invite.id);
    return "ok";
  });

  function registerUserWithInvite(input: {
    id: string; username: string; password_hash: string; invite_code_hash: string; now: number;
  }): RegistrationResult {
    return registerTx(input);
  }

  function hasUsableInvite(codeHash: string, now: number): boolean {
    return !!sql.prepare(`
      SELECT 1 FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(codeHash, now);
  }

  function createInvite(input: {
    id: string; code_hash: string; created_by: string; created_at: number; expires_at: number;
  }): void {
    sql.prepare(`
      INSERT INTO invites (id, code_hash, created_by, created_at, expires_at)
      VALUES (@id, @code_hash, @created_by, @created_at, @expires_at)
    `).run(input);
  }

  function getInvites(limit = 100): InviteRow[] {
    return sql.prepare(`
      SELECT i.id, i.created_by, creator.username AS created_by_username,
             i.created_at, i.expires_at, i.used_at, i.used_by,
             used.username AS used_by_username
      FROM invites i
      JOIN users creator ON creator.id = i.created_by
      LEFT JOIN users used ON used.id = i.used_by
      ORDER BY i.created_at DESC LIMIT ?
    `).all(limit) as InviteRow[];
  }

  function revokeInvite(id: string): boolean {
    return sql.prepare(`DELETE FROM invites WHERE id = ? AND used_at IS NULL`).run(id).changes > 0;
  }

  function upsertBootstrapAgent(agent: {
    id: string; owner_user_id: string; label: string; token_hash: string;
    traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): void {
    sql.prepare(`
      INSERT INTO managed_agents
        (id, owner_user_id, label, token_hash, traffic_quota_gb, traffic_reset_day,
         enabled, source, created_at, updated_at)
      VALUES (@id, @owner_user_id, @label, @token_hash, @traffic_quota_gb,
              @traffic_reset_day, 1, 'config', @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        owner_user_id=excluded.owner_user_id, label=excluded.label,
        token_hash=excluded.token_hash, traffic_quota_gb=excluded.traffic_quota_gb,
        traffic_reset_day=excluded.traffic_reset_day, enabled=1, source='config',
        updated_at=excluded.updated_at
    `).run({ ...agent, now });
  }

  function getManagedAgents(userId: string, includeAll: boolean): ManagedAgentRow[] {
    const where = includeAll ? "" : "WHERE a.owner_user_id = ?";
    const args = includeAll ? [] : [userId];
    return sql.prepare(`${agentSelect} ${where} ORDER BY a.created_at, a.id`)
      .all(...args).map((row: any) => toAgent(row)!) as ManagedAgentRow[];
  }

  function getManagedAgent(id: string): ManagedAgentRow | undefined {
    return toAgent(sql.prepare(`${agentSelect} WHERE a.id = ?`).get(id));
  }

  function getManagedAgentByTokenHash(tokenHash: string): ManagedAgentRow | undefined {
    return toAgent(sql.prepare(`${agentSelect} WHERE a.token_hash = ? AND a.enabled = 1`).get(tokenHash));
  }

  function createManagedAgent(agent: {
    id: string; owner_user_id: string; label: string; token_hash: string;
    traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): ManagedAgentRow {
    sql.prepare(`
      INSERT INTO managed_agents
        (id, owner_user_id, label, token_hash, traffic_quota_gb, traffic_reset_day,
         enabled, source, created_at, updated_at)
      VALUES (@id, @owner_user_id, @label, @token_hash, @traffic_quota_gb,
              @traffic_reset_day, 1, 'user', @now, @now)
    `).run({ ...agent, now });
    return getManagedAgent(agent.id)!;
  }

  function updateManagedAgent(id: string, patch: {
    label: string; traffic_quota_gb: number; traffic_reset_day: number;
  }, now: number): boolean {
    return sql.prepare(`
      UPDATE managed_agents SET label = @label, traffic_quota_gb = @traffic_quota_gb,
        traffic_reset_day = @traffic_reset_day, updated_at = @now
      WHERE id = @id AND source = 'user'
    `).run({ id, ...patch, now }).changes > 0;
  }

  function rotateManagedAgentToken(id: string, tokenHash: string, now: number): boolean {
    return sql.prepare(`
      UPDATE managed_agents SET token_hash = ?, updated_at = ?
      WHERE id = ? AND source = 'user'
    `).run(tokenHash, now, id).changes > 0;
  }

  function deleteManagedAgent(id: string): boolean {
    return sql.prepare(`DELETE FROM managed_agents WHERE id = ? AND source = 'user'`).run(id).changes > 0;
  }

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

  function appendAlertLog(e: Omit<AlertLogRow, "id">): void {
    insAlert.run({ vps_id: e.vps_id, metric: e.metric, event: e.event, value: e.value, ts: e.ts });
  }

  function getAlertLog(limit: number, vpsIds?: string[]): AlertLogRow[] {
    if (vpsIds && vpsIds.length === 0) return [];
    const where = vpsIds ? `WHERE vps_id IN (${vpsIds.map(() => "?").join(",")})` : "";
    return sql.prepare(
      `SELECT id, vps_id, metric, event, value, ts FROM alert_log
       ${where} ORDER BY ts DESC, id DESC LIMIT ?`,
    ).all(...(vpsIds ?? []), limit) as AlertLogRow[];
  }

  return {
    upsertBootstrapUser, getUserByUsername, getUserById, getFirstAdmin, hasUsableInvite,
    registerUserWithInvite, createInvite, getInvites, revokeInvite,
    upsertBootstrapAgent, getManagedAgents, getManagedAgent, getManagedAgentByTokenHash,
    createManagedAgent, updateManagedAgent, rotateManagedAgentToken, deleteManagedAgent,
    insertSnapshot, getOverview, getSeries, getProcesses, getTraffic,
    deleteOlderThan, appendAlertLog, getAlertLog, raw: sql,
  };
}
