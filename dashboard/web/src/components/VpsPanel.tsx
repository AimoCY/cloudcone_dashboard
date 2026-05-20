import type { OverviewRow } from "../types.js";
import type { Range } from "../pages/Dashboard.js";
import { Gauge } from "./Gauge.js";
import { TrafficBar } from "./TrafficBar.js";
import { ProcTable } from "./ProcTable.js";
import { TimeChart } from "./TimeChart.js";

export function VpsPanel({ row, range }: { row: OverviewRow; range: Range }) {
  const s = row.snapshot;
  const memPct = s && s.mem.total > 0 ? (s.mem.used / s.mem.total) * 100 : 0;
  const diskPct = s ? s.disks.reduce((m, d) => Math.max(m, d.percent), 0) : 0;
  const a = new Set(row.alerting);

  return (
    <section className={`panel ${row.online ? "" : "panel--offline"}`}>
      <header className="panel__head">
        <h2>{row.label}</h2>
        <span className={`badge ${row.online ? "badge--ok" : "badge--off"}`}>
          {row.online ? "在线" : "离线"}
        </span>
      </header>
      {s && (
        <>
          <div className="gauges">
            <Gauge label="CPU" pct={s.cpu.total_pct} alerting={a.has("cpu_pct")} />
            <Gauge label="内存" pct={memPct} alerting={a.has("mem_pct")} />
            <Gauge label="磁盘" pct={diskPct} alerting={a.has("disk_pct")} />
          </div>
          <TrafficBar
            usedBytes={row.traffic_month.rx_bytes + row.traffic_month.tx_bytes}
            quotaGb={row.traffic_quota_gb}
          />
          <div className="charts">
            <TimeChart vps={row.vps_id} metric="cpu_pct" label="CPU %" range={range} />
            <TimeChart vps={row.vps_id} metric="mem_used" label="内存使用" range={range} />
            <TimeChart vps={row.vps_id} metric="net_rx_bps" label="下行 B/s" range={range} />
            <TimeChart vps={row.vps_id} metric="net_tx_bps" label="上行 B/s" range={range} />
            <TimeChart vps={row.vps_id} metric="load1" label="负载 (1m)" range={range} />
            <TimeChart vps={row.vps_id} metric="disk_pct_max" label="磁盘 %" range={range} />
          </div>
          <div className="procs">
            <ProcTable title="CPU 占用 Top" procs={s.top_proc_cpu} />
            <ProcTable title="内存占用 Top" procs={s.top_proc_mem} />
          </div>
        </>
      )}
    </section>
  );
}
