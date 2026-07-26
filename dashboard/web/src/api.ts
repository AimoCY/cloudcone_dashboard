import type {
  OverviewRow, SeriesResponse, SeriesMetric, Proc, AlertLogRow, SettingsView, SettingsPatch, CurrentUser,
  ManagedAgent, Invite,
} from "./types.js";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  async login(username: string, password: string): Promise<CurrentUser | null> {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return res.ok ? res.json() as Promise<CurrentUser> : null;
  },
  async register(username: string, password: string, inviteCode: string): Promise<{ user: CurrentUser | null; error: string }> {
    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, invite_code: inviteCode }),
    });
    const body = await res.json().catch(() => ({})) as any;
    return res.ok
      ? { user: body as CurrentUser, error: "" }
      : { user: null, error: body.detail ?? body.error ?? `注册失败 (${res.status})` };
  },
  logout: () => fetch("/logout", { method: "POST" }),
  me: () => getJson<CurrentUser>("/api/me"),
  overview: () => getJson<OverviewRow[]>("/api/overview"),
  series: (vps: string, metric: SeriesMetric, from: number, to: number) =>
    getJson<SeriesResponse>(`/api/series?vps=${encodeURIComponent(vps)}&metric=${metric}&from=${from}&to=${to}`),
  processes: (vps: string) =>
    getJson<{ cpu: Proc[]; mem: Proc[] }>(`/api/processes?vps=${encodeURIComponent(vps)}`),
  alertLog: () => getJson<AlertLogRow[]>("/api/alert-log"),
  agents: () => getJson<ManagedAgent[]>("/api/agents"),
  async createAgent(values: { label: string; traffic_quota_gb: number; traffic_reset_day: number }) {
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(`创建失败 (${res.status})`);
    return res.json() as Promise<{ agent: ManagedAgent; token: string }>;
  },
  async updateAgent(id: string, values: { label: string; traffic_quota_gb: number; traffic_reset_day: number }) {
    const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(`保存失败 (${res.status})`);
    return res.json() as Promise<ManagedAgent>;
  },
  async rotateAgentToken(id: string) {
    const res = await fetch(`/api/agents/${encodeURIComponent(id)}/rotate-token`, {
      method: "POST", credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`轮换失败 (${res.status})`);
    return res.json() as Promise<{ token: string }>;
  },
  async deleteAgent(id: string): Promise<boolean> {
    const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
      method: "DELETE", credentials: "same-origin",
    });
    return res.ok;
  },
  invites: () => getJson<Invite[]>("/api/invites"),
  async createInvite(expiresInDays: number) {
    const res = await fetch("/api/invites", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ expires_in_days: expiresInDays }),
    });
    if (!res.ok) throw new Error(`邀请码生成失败 (${res.status})`);
    return res.json() as Promise<{ id: string; code: string; created_at: number; expires_at: number }>;
  },
  async revokeInvite(id: string): Promise<boolean> {
    const res = await fetch(`/api/invites/${encodeURIComponent(id)}`, {
      method: "DELETE", credentials: "same-origin",
    });
    return res.ok;
  },
  getSettings: () => getJson<SettingsView>("/api/settings"),
  async putSettings(patch: SettingsPatch): Promise<boolean> {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(patch),
    });
    return res.ok;
  },
};
