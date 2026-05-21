import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { OverviewRow, Snapshot, SeriesMetric, Proc } from "../types.js";
import { useOverview } from "../hooks.js";
import { type Range, RANGE_SECONDS } from "../range.js";
import { GB, fmtBps, fmtTraffic, gb, uptimeStr, memPct } from "../format.js";
import { TopNav } from "../components/TopNav.js";
import { RangeTabs } from "../components/RangeTabs.js";
import { Sparkline } from "../components/Sparkline.js";
import { TimeChart, type ChartKind } from "../components/TimeChart.js";

const METRICS: { key: SeriesMetric; label: string; kind: ChartKind }[] = [
  { key: "cpu_pct", label: "CPU", kind: "pct" },
  { key: "mem_used", label: "内存", kind: "bytes" },
  { key: "net_rx_bps", label: "下行", kind: "bps" },
  { key: "net_tx_bps", label: "上行", kind: "bps" },
  { key: "disk_pct_max", label: "磁盘", kind: "pct" },
];

function netSum(s: Snapshot) {
  return s.nets.reduce((a, n) => ({ rx: a.rx + n.rx_bps, tx: a.tx + n.tx_bps }), { rx: 0, tx: 0 });
}
function diskMax(s: Snapshot) {
  return s.disks.reduce((m, d) => Math.max(m, d.percent), 0);
}

// Live "big number" for a metric tile, from the latest snapshot.
function tileValue(key: SeriesMetric, s: Snapshot): { v: string; u: string; tone: string } {
  if (key === "cpu_pct") {
    const x = s.cpu.total_pct;
    return { v: x.toFixed(0), u: "%", tone: x >= 85 ? "bad" : x >= 65 ? "warn" : "" };
  }
  if (key === "mem_used") {
    const x = memPct(s.mem.used, s.mem.total);
    return { v: x.toFixed(0), u: "%", tone: x >= 90 ? "bad" : x >= 75 ? "warn" : "" };
  }
  if (key === "disk_pct_max") {
    const x = diskMax(s);
    return { v: x.toFixed(0), u: "%", tone: x >= 90 ? "bad" : x >= 75 ? "warn" : "" };
  }
  const bps = key === "net_rx_bps" ? netSum(s).rx : netSum(s).tx;
  const f = fmtBps(bps).split(" ");
  return { v: f[0], u: f[1] ?? "", tone: "" };
}

export function ServerDetail({ vpsId }: { vpsId: string }) {
  const { rows, loaded } = useOverview();
  const [range, setRange] = useState<Range>("24h");
  const [selected, setSelected] = useState<SeriesMetric>("cpu_pct");
  const [series, setSeries] = useState<Record<string, { t: number; v: number }[]>>({});
  const [procs, setProcs] = useState<Proc[]>([]);

  const row = rows.find((r) => r.vps_id === vpsId);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - RANGE_SECONDS[range];
      Promise.all(METRICS.map((m) => api.series(vpsId, m.key, from, to)))
        .then((results) => {
          if (!alive) return;
          const map: Record<string, { t: number; v: number }[]> = {};
          results.forEach((r, i) => { map[METRICS[i].key] = r.points; });
          setSeries(map);
        })
        .catch(() => {});
      api.processes(vpsId).then((p) => alive && setProcs(p.cpu)).catch(() => {});
    };
    load();
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, [vpsId, range]);

  if (loaded && !row) {
    return (
      <div className="app">
        <TopNav active="fleet" />
        <div className="section"><p className="mut">找不到服务器 <span className="mono">{vpsId}</span>。<a href="#/">返回 Fleet</a></p></div>
      </div>
    );
  }

  const s = row?.snapshot ?? null;
  const sel = METRICS.find((m) => m.key === selected)!;
  const selData = series[selected] ?? [];
  const monthBytes = row ? row.traffic_month.rx_bytes + row.traffic_month.tx_bytes : 0;
  const quotaBytes = (row?.traffic_quota_gb ?? 0) * GB;
  const monthPct = quotaBytes > 0 ? Math.min(100, (monthBytes / quotaBytes) * 100) : 0;
  const lastPush = row ? Math.max(0, Math.floor(Date.now() / 1000) - row.ts) : 0;

  return (
    <div className="app">
      <TopNav active="fleet" right={
        row && (row.alerting.length > 0
          ? <span className="chip bad"><span className="dot bad" />{row.alerting.length} 告警</span>
          : <span className="chip"><span className="dot ok" />正常</span>)
      } />

      {/* Identity strip */}
      <div className="section">
        <span className="h-eyebrow"><a href="#/" style={{ textDecoration: "none", color: "var(--mut)" }}>Fleet</a> / {row?.label ?? vpsId}</span>
        <div className="row resp-stack" style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, gap: 12 }}>
          <div className="col gap-4">
            <div className="row gap-8" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
              <h1 className="mono" style={{ fontSize: 24 }}>{row?.label ?? vpsId}</h1>
              {s && <span className="chip on">{s.cpu.per_core.length} vCPU</span>}
              {s && <span className="chip">{(s.mem.total / GB).toFixed(1)} GB RAM</span>}
              <span className={`chip ${row?.online ? "ok" : "bad"}`}>
                <span className={`dot ${row?.online ? "ok" : "bad"}`} />{row?.online ? "online" : "offline"}
              </span>
            </div>
            <span className="mut mono" style={{ fontSize: 11 }}>
              {s ? `up ${uptimeStr(s.uptime_sec)} · ` : ""}
              {row ? `last push ${lastPush}s ago` : "—"}
            </span>
          </div>
          <RangeTabs value={range} onChange={setRange} />
        </div>
      </div>

      {/* Metric tile rail */}
      <div className="section tile-rail">
        {METRICS.map((m) => {
          const tv = s ? tileValue(m.key, s) : { v: "—", u: "", tone: "" };
          const on = m.key === selected;
          return (
            <button key={m.key} onClick={() => setSelected(m.key)} className="col gap-4"
              style={{
                background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                padding: "8px 10px", borderBottom: on ? "2px solid var(--ink)" : "2px solid transparent",
              }}>
              <span className="h-eyebrow">{m.label}</span>
              <div className="row gap-2" style={{ alignItems: "baseline" }}>
                <span className={`mono ${tv.tone}`} style={{ fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{tv.v}</span>
                <span className="mono mut" style={{ fontSize: 11 }}>{tv.u}</span>
              </div>
              <Sparkline data={(series[m.key] ?? []).map((p) => p.v)} w={150} h={22}
                color={tv.tone} filled />
            </button>
          );
        })}
      </div>

      {/* Primary chart */}
      <div className="section" style={{ flex: 1, minHeight: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="h-eyebrow">{sel.label} · {range} 历史</span>
          <span className="mono mut" style={{ fontSize: 11 }}>
            {selData.length} 个采样点
          </span>
        </div>
        {selData.length > 1
          ? <TimeChart data={selData} label={sel.label} kind={sel.kind} height={260} />
          : <p className="mut" style={{ fontSize: 12 }}>该时间范围内还没有数据。</p>}
      </div>

      {/* Bottom rail */}
      <div className="row resp-stack" style={{ alignItems: "stretch", borderTop: "1px solid var(--line)" }}>
        <div className="bdR grow" style={{ padding: "16px 28px" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span className="h-eyebrow">Top 进程 · CPU</span>
            <span className="mono mut" style={{ fontSize: 10 }}>10s 刷新</span>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>PID</th><th>进程</th><th style={{ textAlign: "right" }}>CPU %</th><th style={{ textAlign: "right" }}>MEM %</th></tr>
            </thead>
            <tbody>
              {procs.slice(0, 8).map((p) => (
                <tr key={p.pid}>
                  <td className="mut">{p.pid}</td>
                  <td>{p.name}</td>
                  <td style={{ textAlign: "right" }} className={p.cpu_pct > 30 ? "bad" : ""}>{p.cpu_pct.toFixed(1)}</td>
                  <td style={{ textAlign: "right" }} className="mut">{p.mem_pct.toFixed(1)}</td>
                </tr>
              ))}
              {procs.length === 0 && <tr><td colSpan={4} className="mut">无数据</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "16px 28px", flex: 1 }}>
          <span className="h-eyebrow">本月流量</span>
          <div className="row gap-4" style={{ alignItems: "baseline", marginTop: 6 }}>
            <span className={`mono ${monthPct > 80 ? "warn" : ""}`} style={{ fontSize: 26, fontWeight: 500 }}>
              {fmtTraffic(monthBytes).split(" ")[0]}
            </span>
            <span className="mono mut" style={{ fontSize: 12 }}>
              {fmtTraffic(monthBytes).split(" ")[1]} / {row?.traffic_quota_gb ?? 0} GB
            </span>
            <span className="mut mono" style={{ fontSize: 11, marginLeft: 8 }}>{monthPct.toFixed(0)}%</span>
          </div>
          <div className={`bar ${monthPct > 80 ? "warn" : ""}`} style={{ marginTop: 8 }}>
            <i style={{ width: `${monthPct}%` }} />
          </div>
          <div className="row gap-16" style={{ marginTop: 12 }}>
            <div className="col gap-2">
              <span className="h-eyebrow" style={{ fontSize: 9 }}>↓ 入站</span>
              <span className="mono" style={{ fontSize: 13 }}>{fmtTraffic(row?.traffic_month.rx_bytes ?? 0)}</span>
            </div>
            <div className="col gap-2">
              <span className="h-eyebrow" style={{ fontSize: 9 }}>↑ 出站</span>
              <span className="mono" style={{ fontSize: 13 }}>{fmtTraffic(row?.traffic_month.tx_bytes ?? 0)}</span>
            </div>
            <div className="col gap-2">
              <span className="h-eyebrow" style={{ fontSize: 9 }}>磁盘总量</span>
              <span className="mono" style={{ fontSize: 13 }}>
                {s ? `${gb(s.disks.reduce((m, d) => m + d.total, 0)).toFixed(0)} GB` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
