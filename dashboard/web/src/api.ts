import type { OverviewRow, SeriesResponse, SeriesMetric, Proc } from "./types.js";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  async login(password: string): Promise<boolean> {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  },
  logout: () => fetch("/logout", { method: "POST" }),
  overview: () => getJson<OverviewRow[]>("/api/overview"),
  series: (vps: string, metric: SeriesMetric, from: number, to: number) =>
    getJson<SeriesResponse>(`/api/series?vps=${vps}&metric=${metric}&from=${from}&to=${to}`),
  processes: (vps: string) =>
    getJson<{ cpu: Proc[]; mem: Proc[] }>(`/api/processes?vps=${vps}`),
};
