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

// Resolve a CSS custom property to an rgba() string at the given alpha.
function withAlpha(hex: string, a: number): string {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Interactive uPlot line chart — coloured stroke + gradient area fill, themed.
// `colorVar` is a CSS custom-property name (e.g. "--m-cpu") for the line colour.
export function TimeChart({
  data, label, kind, height = 240, colorVar = "--primary",
}: {
  data: { t: number; v: number }[];
  label: string;
  kind: ChartKind;
  height?: number;
  colorVar?: string;
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
    const stroke = cssv(colorVar) || cssv("--primary");

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
      cursor: { points: { size: 6 } },
      series: [
        {},
        {
          label,
          stroke,
          width: 1.9,
          points: { show: false },
          fill: (u) => {
            const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
            g.addColorStop(0, withAlpha(stroke, 0.34));
            g.addColorStop(1, withAlpha(stroke, 0.02));
            return g;
          },
          value: (_u, v) => fmtKind(kind, v as number),
        },
      ],
      axes: [
        { ...axis },
        { ...axis, size: 52, values: (_u, vals) => vals.map((v) => fmtKind(kind, v as number)) },
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
  }, [data, label, kind, height, dark, colorVar]);

  return <div ref={hostRef} style={{ width: "100%" }} />;
}
