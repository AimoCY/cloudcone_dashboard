import { useId } from "react";

// Line-frame sparkline with an optional gradient area fill, from real data.
// `stroke` is a CSS colour value (e.g. "var(--m-cpu)") so callers can colour
// each metric distinctly.
export function Sparkline({
  data, w = 80, h = 22, stroke = "var(--primary)", filled = false,
}: {
  data: number[]; w?: number; h?: number; stroke?: string; filled?: boolean;
}) {
  const gid = "sg" + useId().replace(/:/g, "");
  if (data.length < 2) {
    return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const y = (v: number) => h - 2 - ((v - min) / range) * (h - 5);
  const path = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {filled && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: stroke }} stopOpacity="0.42" />
              <stop offset="100%" style={{ stopColor: stroke }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path
        d={path}
        fill="none"
        style={{ stroke }}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
