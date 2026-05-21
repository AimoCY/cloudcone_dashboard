import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useDark } from "../theme.js";

export type ChartKind = "pct" | "bps" | "bytes" | "num";

export function fmtKind(kind: ChartKind, v: number): string {
  if (v == null) return "";
  if (kind === "pct") return `${v.toFixed(0)}%`;
  if (kind === "bps" || kind === "bytes") {
    if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)}G`;
    if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)}M`;
    if (v >= 1024) return `${(v / 1024).toFixed(0)}K`;
    return v.toFixed(0);
  }
  return v.toFixed(2);
}

// Interactive uPlot line chart, themed to the line-frame design (light/dark).
export function TimeChart({
  data, label, kind, height = 240,
}: {
  data: { t: number; v: number }[];
  label: string;
  kind: ChartKind;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dark = useDark();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cs = getComputedStyle(document.documentElement);
    const cssv = (n: string) => cs.getPropertyValue(n).trim();
    const axisColor = cssv("--mut");
    const gridColor = cssv("--line-2");
    const stroke = cssv("--ink-2");

    const xs = data.map((p) => p.t);
    const ys = data.map((p) => p.v);
    const axis = {
      stroke: axisColor,
      grid: { stroke: gridColor, width: 1 },
      ticks: { stroke: gridColor, width: 1 },
      font: "11px var(--mono)",
    };
    const opts: uPlot.Options = {
      width: host.clientWidth || 600,
      height,
      scales: { x: { time: true } },
      legend: { show: false },
      cursor: { points: { size: 5 } },
      series: [
        {},
        {
          label,
          stroke,
          width: 1.6,
          fill: dark ? "rgba(212,212,216,0.06)" : "rgba(63,63,70,0.06)",
          value: (_u, v) => fmtKind(kind, v as number),
        },
      ],
      axes: [
        { ...axis },
        { ...axis, size: 50, values: (_u, vals) => vals.map((v) => fmtKind(kind, v as number)) },
      ],
    };
    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, [xs, ys] as uPlot.AlignedData, host);

    const ro = new ResizeObserver(() => {
      if (plotRef.current) plotRef.current.setSize({ width: host.clientWidth, height });
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [data, label, kind, height, dark]);

  return <div ref={hostRef} style={{ width: "100%" }} />;
}
