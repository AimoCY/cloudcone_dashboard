import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { CurrentUser, OverviewRow, Snapshot } from "../types.js";
import { useOverview } from "../hooks.js";
import { type Range, RANGE_SECONDS } from "../range.js";
import { GB, fmtBps, fmtTraffic, gb, uptimeStr, memPct } from "../format.js";
import { TopNav } from "../components/TopNav.js";
import { RangeTabs } from "../components/RangeTabs.js";
import { Sparkline } from "../components/Sparkline.js";

type Tone = "ok" | "warn" | "bad" | "off";

function netSum(s: Snapshot): { rx: number; tx: number } {
  return s.nets.reduce((a, n) => ({ rx: a.rx + n.rx_bps, tx: a.tx + n.tx_bps }), { rx: 0, tx: 0 });
}
function diskMax(s: Snapshot): number {
  return s.disks.reduce((m, d) => Math.max(m, d.percent), 0);
}
function serverTone(r: OverviewRow): Tone {
  if (!r.online || !r.snapshot) return "off";
  if (r.alerting.length > 0) return "bad";
  const s = r.snapshot;
  if (s.cpu.total_pct >= 75 || memPct(s.mem.used, s.mem.total) >= 80 || diskMax(s) >= 80) return "warn";
  return "ok";
}

// One "Needs attention" focal card — fetches its own CPU history sparkline.
function HotspotCard({ row, range }: { row: OverviewRow; range: Range }) {
  const [pts, setPts] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    const to = Math.floor(Date.now() / 1000);
    api.series(row.vps_id, "cpu_pct", to - RANGE_SECONDS[range], to)
      .then((r) => alive && setPts(r.points.map((p) => p.v)))
      .catch(() => {});
    return () => { alive = false; };
  }, [row.vps_id, range]);

  const cpu = row.snapshot?.cpu.total_pct ?? 0;
  const cpuTone = cpu > 85 ? "bad" : "warn";
  return (
    <a href={`#/server/${row.vps_id}`} className={`row gap-16 ${cpuTone === "bad" ? "badCard" : "warnCard"}`}
      style={{ padding: "16px 18px", flex: 1, textDecoration: "none", color: "inherit", border: "1px solid" }}>
      <div className="col gap-2" style={{ width: 160 }}>
        <div className="row gap-8">
          <span className={`dot ${serverTone(row)}`} />
          <span className="mono strong" style={{ fontSize: 14 }}>{row.label}</span>
        </div>
        <span className={`mono ${cpuTone}`} style={{ fontSize: 11, marginTop: 4 }}>
          {row.alerting.length} 项越限
        </span>
        <span className="mut mono" style={{ fontSize: 10 }}>{row.alerting.join(" · ") || "—"}</span>
      </div>
      <div className="grow">
        <Sparkline data={pts} w={420} h={48}
          stroke={cpuTone === "bad" ? "var(--red)" : "var(--amber)"} filled />
      </div>
      <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
        <span className={`mono ${cpuTone}`} style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>
          {cpu.toFixed(0)}<span style={{ fontSize: 13, color: "var(--mut)" }}>%</span>
        </span>
        <span className="mono mut" style={{ fontSize: 11 }}>CPU</span>
      </div>
    </a>
  );
}

function ServerCard({ row }: { row: OverviewRow }) {
  const s = row.snapshot;
  const t = serverTone(row);
  const cpu = s?.cpu.total_pct ?? 0;
  const mem = s ? memPct(s.mem.used, s.mem.total) : 0;
  const disk = s ? diskMax(s) : 0;
  const net = s ? netSum(s) : { rx: 0, tx: 0 };
  const monthBytes = row.traffic_month.rx_bytes + row.traffic_month.tx_bytes;
  const quotaBytes = row.traffic_quota_gb * GB;
  const monthPct = quotaBytes > 0 ? Math.min(100, (monthBytes / quotaBytes) * 100) : 0;
  const cpuTone = cpu > 85 ? "bad" : cpu > 65 ? "warn" : "";
  const memTone = mem > 80 ? "warn" : "";
  const diskTone = disk > 80 ? "warn" : "";
  const monthTone = monthPct > 80 ? "warn" : "";

  return (
    <a href={`#/server/${row.vps_id}`} className={`srv-card ${t}`}>
      <div className="col gap-2" style={{ width: 190 }}>
        <div className="row gap-8">
          <span className={`dot ${t}`} />
          <span className="mono strong" style={{ fontSize: 13 }}>{row.label}</span>
        </div>
        <span className="mut mono" style={{ fontSize: 11 }}>
          {row.online && s ? `up ${uptimeStr(s.uptime_sec)}` : "offline"}
        </span>
      </div>

      <div className="col gap-2" style={{ width: 86 }}>
        <span className="h-eyebrow" style={{ fontSize: 9 }}>CPU</span>
        <div className="row gap-2" style={{ alignItems: "baseline" }}>
          <span className={`mono ${cpuTone}`} style={{ fontSize: 22, fontWeight: 500, lineHeight: 1 }}>
            {cpu.toFixed(0)}
          </span>
          <span className="mono mut" style={{ fontSize: 11 }}>%</span>
        </div>
      </div>

      <div className="col gap-4 grow">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="h-eyebrow" style={{ fontSize: 9 }}>内存</span>
          <span className={`mono ${memTone}`} style={{ fontSize: 11 }}>{mem.toFixed(0)}%</span>
        </div>
        <div className={`bar ${memTone}`}><i style={{ width: `${mem}%` }} /></div>
      </div>

      <div className="col gap-2 resp-hide" style={{ width: 116 }}>
        <span className="h-eyebrow" style={{ fontSize: 9 }}>网络</span>
        <div className="col" style={{ lineHeight: 1.25 }}>
          <span className="mono" style={{ fontSize: 11 }}>↓ {fmtBps(net.rx)}</span>
          <span className="mut mono" style={{ fontSize: 11 }}>↑ {fmtBps(net.tx)}</span>
        </div>
      </div>

      <div className="col gap-4 grow">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="h-eyebrow" style={{ fontSize: 9 }}>磁盘</span>
          <span className={`mono ${diskTone}`} style={{ fontSize: 11 }}>{disk.toFixed(0)}%</span>
        </div>
        <div className={`bar ${diskTone}`}><i style={{ width: `${disk}%` }} /></div>
      </div>

      <div className="col gap-4 grow resp-hide">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="h-eyebrow" style={{ fontSize: 9 }}>本月流量</span>
          <span className={`mono ${monthTone}`} style={{ fontSize: 11 }}>{monthPct.toFixed(0)}%</span>
        </div>
        <div className={`bar ${monthTone}`}><i style={{ width: `${monthPct}%` }} /></div>
      </div>

      <div className="col" style={{ width: 76, alignItems: "flex-end" }}>
        {row.alerting.length > 0
          ? <span className="chip bad" style={{ fontSize: 11 }}>{row.alerting.length} 告警</span>
          : !row.online
          ? <span className="mut mono" style={{ fontSize: 10 }}>离线</span>
          : <span className="mut mono" style={{ fontSize: 11 }}>正常</span>}
      </div>
    </a>
  );
}

export function Fleet({ user }: { user: CurrentUser }) {
  const { rows, error, loaded } = useOverview();
  const [range, setRange] = useState<Range>("1h");

  const online = rows.filter((r) => r.online);
  const cpuAvg = online.length
    ? online.reduce((a, r) => a + (r.snapshot?.cpu.total_pct ?? 0), 0) / online.length
    : 0;
  const netIn = online.reduce((a, r) => a + (r.snapshot ? netSum(r.snapshot).rx : 0), 0);
  const firing = rows.reduce((a, r) => a + r.alerting.length, 0);
  const monthUsed = rows.reduce((a, r) => a + r.traffic_month.rx_bytes + r.traffic_month.tx_bytes, 0);
  const monthQuota = rows.reduce((a, r) => a + r.traffic_quota_gb, 0);
  const monthPct = monthQuota > 0 ? (gb(monthUsed) / monthQuota) * 100 : 0;
  const hotspots = rows.filter((r) => r.alerting.length > 0);

  const hero = [
    { lbl: "在线", v: String(online.length), u: `/ ${rows.length}`,
      sub: `${rows.length - online.length} 台离线` },
    { lbl: "平均 CPU", v: cpuAvg.toFixed(0), u: "%", sub: "在线机群均值" },
    { lbl: "总下行", v: fmtBps(netIn).split(" ")[0], u: fmtBps(netIn).split(" ")[1] ?? "",
      sub: "全机群合计" },
    { lbl: "告警中", v: String(firing), u: "", sub: firing > 0 ? "需要处理" : "全部正常",
      tone: firing > 0 ? "bad" : "" },
    { lbl: "本月流量", v: fmtTraffic(monthUsed).split(" ")[0], u: fmtTraffic(monthUsed).split(" ")[1] ?? "",
      sub: `${monthPct.toFixed(0)}% / ${monthQuota} GB 配额`, tone: monthPct > 80 ? "warn" : "" },
  ];

  return (
    <div className="app">
      <TopNav active="fleet" user={user} right={
        <>
          <span className="chip"><span className="dot ok" />{online.length} 在线</span>
          {firing > 0 && <span className="chip bad"><span className="dot bad" />{firing} 告警</span>}
        </>
      } />

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div className="col gap-4">
            <span className="h-eyebrow">Fleet</span>
            <div className="row gap-12" style={{ alignItems: "baseline" }}>
              <h1 className="mono" style={{ fontSize: 26 }}>{rows.length} 台服务器</h1>
              <span className="mut mono" style={{ fontSize: 12 }}>Cloudcone VPS · 实时监控</span>
            </div>
          </div>
          <RangeTabs value={range} onChange={setRange} />
        </div>
        <div className="hero-grid">
          {hero.map((c) => (
            <div key={c.lbl} className="col gap-4">
              <span className="h-eyebrow">{c.lbl}</span>
              <div className="row gap-4" style={{ alignItems: "baseline" }}>
                <span className={`hero-num ${c.tone || ""}`}>{c.v}</span>
                <span className="mono mut" style={{ fontSize: 14 }}>{c.u}</span>
              </div>
              <span className="mut" style={{ fontSize: 11 }}>{c.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {hotspots.length > 0 && (
        <div className="section">
          <div className="col gap-2" style={{ marginBottom: 14 }}>
            <span className="h-eyebrow">Needs attention</span>
            <h2 className="mono">{hotspots.length} 台越过阈值</h2>
          </div>
          <div className="row gap-16 resp-stack">
            {hotspots.map((r) => <HotspotCard key={r.vps_id} row={r} range={range} />)}
          </div>
        </div>
      )}

      <div className="section" style={{ borderBottom: "none", flex: 1 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <span className="h-eyebrow">All servers</span>
        </div>
        {error && <p className="error">{error}</p>}
        {loaded && rows.length === 0 && <p className="mut">还没有 agent 上报数据。</p>}
        <div className="col gap-8">
          {rows.map((r) => <ServerCard key={r.vps_id} row={r} />)}
        </div>
      </div>
    </div>
  );
}
