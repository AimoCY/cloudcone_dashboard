import { describe, it, expect } from "vitest";
import { AlertEngine } from "./alerts.js";

const thresholds = { cpu_pct: 90, mem_pct: 90, disk_pct: 90, traffic_pct: 90, offline_seconds: 60 };

function engine() {
  const sent: string[] = [];
  const eng = new AlertEngine(() => thresholds, { send: async (_vps: string, m: string) => { sent.push(m); } });
  return { eng, sent };
}

describe("AlertEngine", () => {
  it("does not alert until threshold is exceeded twice in a row (hysteresis)", () => {
    const { eng, sent } = engine();
    eng.evaluate("vps-a", { cpu_pct: 95, mem_pct: 10, disk_pct: 10, traffic_pct: 10 }, 1000);
    expect(sent).toHaveLength(0); // first breach: armed, not fired
    eng.evaluate("vps-a", { cpu_pct: 96, mem_pct: 10, disk_pct: 10, traffic_pct: 10 }, 1005);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("CPU");
  });

  it("does not re-notify while staying in the alerting state", () => {
    const { eng, sent } = engine();
    for (const ts of [1, 2, 3, 4, 5]) {
      eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 10, disk_pct: 10, traffic_pct: 10 }, ts);
    }
    expect(sent).toHaveLength(1);
  });

  it("sends a recovery message after two consecutive in-range samples", () => {
    const { eng, sent } = engine();
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 1);
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 2); // -> alerting
    eng.evaluate("vps-a", { cpu_pct: 10, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 3); // recovering
    expect(sent).toHaveLength(1);
    eng.evaluate("vps-a", { cpu_pct: 10, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 4); // -> ok
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("恢复");
  });

  it("tracks metrics independently per vps", () => {
    const { eng, sent } = engine();
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 1);
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 2);
    eng.evaluate("vps-b", { cpu_pct: 1, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 2);
    expect(sent.filter((m) => m.includes("vps-a"))).toHaveLength(1);
    expect(sent.filter((m) => m.includes("vps-b"))).toHaveLength(0);
  });

  it("alerts and recovers on agent offline transitions", () => {
    const { eng, sent } = engine();
    eng.markSeen("vps-a", 1000);
    eng.checkOffline(1000 + 61); // 61s since last seen > 60s threshold
    expect(sent.some((m) => m.includes("离线"))).toBe(true);
    eng.markSeen("vps-a", 2000); // agent came back
    eng.checkOffline(2000 + 5);
    expect(sent.some((m) => m.includes("恢复"))).toBe(true);
  });

  it("snapshot() exposes current alerting metrics for the UI", () => {
    const { eng } = engine();
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 1);
    eng.evaluate("vps-a", { cpu_pct: 99, mem_pct: 1, disk_pct: 1, traffic_pct: 1 }, 2);
    expect(eng.snapshot()["vps-a"]).toContain("cpu_pct");
  });
});
