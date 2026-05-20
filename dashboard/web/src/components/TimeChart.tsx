import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { api } from "../api.js";
import type { SeriesMetric } from "../types.js";
import { RANGE_SECONDS, type Range } from "../pages/Dashboard.js";

const BYTES_METRICS: SeriesMetric[] = [
  "mem_used", "swap_used", "disk_read_bps", "disk_write_bps", "net_rx_bps", "net_tx_bps",
];

// Dark-theme axis styling so charts are legible on the dark dashboard.
const AXIS = {
  stroke: "#7d8794",
  grid: { stroke: "#232a37", width: 1 },
  ticks: { stroke: "#232a37", width: 1 },
};

function fmtValue(metric: SeriesMetric, v: number): string {
  if (metric === "cpu_pct" || metric === "disk_pct_max") return `${v.toFixed(0)}%`;
  if (BYTES_METRICS.includes(metric)) {
    if (v > 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)}M`;
    if (v > 1024) return `${(v / 1024).toFixed(0)}K`;
    return `${v.toFixed(0)}`;
  }
  return v.toFixed(2);
}

export function TimeChart(
  { vps, metric, label, range }: { vps: string; metric: SeriesMetric; label: string; range: Range },
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const to = Math.floor(Date.now() / 1000);
      const from = to - RANGE_SECONDS[range];
      const resp = await api.series(vps, metric, from, to);
      if (!alive || !hostRef.current) return;
      const xs = resp.points.map((p) => p.t);
      const ys = resp.points.map((p) => p.v);
      const data: uPlot.AlignedData = [xs, ys];
      if (plotRef.current) {
        plotRef.current.setData(data);
      } else {
        plotRef.current = new uPlot(
          {
            title: label,
            width: hostRef.current.clientWidth || 360,
            height: 140,
            scales: { x: { time: true } },
            series: [
              {},
              {
                label, stroke: "#4f9cff", width: 2, fill: "rgba(79,156,255,0.12)",
                value: (_u, v) => (v == null ? "" : fmtValue(metric, v)),
              },
            ],
            axes: [
              { ...AXIS },
              { ...AXIS, values: (_u, vals) => vals.map((v) => fmtValue(metric, v)) },
            ],
          },
          data,
          hostRef.current,
        );
      }
    }
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [vps, metric, range, label]);

  return <div className="chart" ref={hostRef} />;
}
