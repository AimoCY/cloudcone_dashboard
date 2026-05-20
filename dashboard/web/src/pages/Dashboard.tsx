import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { OverviewRow } from "../types.js";
import { VpsPanel } from "../components/VpsPanel.js";

export type Range = "1h" | "6h" | "24h" | "7d";
export const RANGE_SECONDS: Record<Range, number> = {
  "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800,
};

export function Dashboard() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [range, setRange] = useState<Range>("6h");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.overview().then((r) => alive && setRows(r)).catch((e) => alive && setErr(String(e)));
    tick();
    const id = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="dashboard">
      <header className="topbar">
        <h1>VPS 监控</h1>
        <div className="topbar__right">
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="1h">最近 1 小时</option>
            <option value="6h">最近 6 小时</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
          </select>
          <button onClick={() => api.logout().then(() => location.reload())}>退出</button>
        </div>
      </header>
      {err && <p className="error">{err}</p>}
      <div className="panels">
        {rows.map((r) => <VpsPanel key={r.vps_id} row={r} range={range} />)}
      </div>
    </div>
  );
}
