import type { Range } from "../range.js";

const RANGES: Range[] = ["1h", "6h", "24h", "7d"];

// Segmented 1h / 6h / 24h / 7d time-range control.
export function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="row" style={{ border: "1px solid var(--line)" }}>
      {RANGES.map((r, i) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className="mono"
          style={{
            padding: "3px 10px",
            fontSize: 11,
            cursor: "pointer",
            border: "none",
            borderRight: i < RANGES.length - 1 ? "1px solid var(--line)" : "none",
            color: r === value ? "var(--bg)" : "var(--mut)",
            background: r === value ? "var(--ink)" : "transparent",
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
