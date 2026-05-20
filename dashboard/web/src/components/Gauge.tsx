export function Gauge({ label, pct, alerting }: { label: string; pct: number; alerting?: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`gauge ${alerting ? "gauge--alert" : ""}`}>
      <div className="gauge__label">{label}</div>
      <div className="gauge__value">{clamped.toFixed(1)}%</div>
      <div className="gauge__track">
        <div className="gauge__fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
