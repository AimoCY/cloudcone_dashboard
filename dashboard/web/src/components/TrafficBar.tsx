function gb(bytes: number): number { return bytes / 1024 ** 3; }

export function TrafficBar({ usedBytes, quotaGb }: { usedBytes: number; quotaGb: number }) {
  const usedGb = gb(usedBytes);
  const pct = quotaGb > 0 ? Math.min(100, (usedGb / quotaGb) * 100) : 0;
  return (
    <div className={`traffic ${pct >= 90 ? "traffic--alert" : ""}`}>
      <div className="traffic__label">
        本月流量 {usedGb.toFixed(1)} / {quotaGb} GB（{pct.toFixed(0)}%）
      </div>
      <div className="traffic__track">
        <div className="traffic__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
