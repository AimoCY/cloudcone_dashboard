// Line-frame sparkline rendered from real data points.
export function Sparkline({
  data, w = 80, h = 22, color = "", filled = false,
}: {
  data: number[]; w?: number; h?: number; color?: string; filled?: boolean;
}) {
  if (data.length < 2) {
    return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const y = (v: number) => h - 2 - ((v - min) / range) * (h - 4);
  const path = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const fill = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {filled && <path d={fill} className={`sparkFill ${color}`} />}
      <path d={path} className={`spark ${color}`} />
    </svg>
  );
}
