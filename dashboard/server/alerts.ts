// Alert engine: per (vps, metric) state machine with 2-sample hysteresis.
// Notifications fire ONLY on state transitions, so a sustained alert never
// spams. Offline detection is a separate metric driven by markSeen/checkOffline.
// Every transition is also reported via onEvent for the alert log.

export interface Thresholds {
  cpu_pct: number; mem_pct: number; disk_pct: number;
  traffic_pct: number; offline_seconds: number;
}
export interface MetricValues {
  cpu_pct: number; mem_pct: number; disk_pct: number; traffic_pct: number;
}
export interface Notifier { send(vps: string, message: string): Promise<void>; }

export interface AlertEvent {
  vps_id: string;
  metric: string;
  event: "triggered" | "recovered";
  value: number;
  ts: number;
}

type State = "ok" | "alerting";
interface Cell { state: State; over: number; under: number; }

const LABELS: Record<string, string> = {
  cpu_pct: "CPU", mem_pct: "内存", disk_pct: "磁盘",
  traffic_pct: "流量", offline: "在线状态",
};

export class AlertEngine {
  private cells = new Map<string, Cell>(); // key: `${vps}|${metric}`
  private lastSeen = new Map<string, number>();

  // `getThresholds` is read fresh on every evaluation so live settings edits
  // take effect immediately. `onEvent` records transitions to the alert log.
  constructor(
    private getThresholds: (vps: string) => Thresholds,
    private notifier: Notifier,
    private onEvent: (e: AlertEvent) => void = () => {},
  ) {}

  private cell(key: string): Cell {
    let c = this.cells.get(key);
    if (!c) { c = { state: "ok", over: 0, under: 0 }; this.cells.set(key, c); }
    return c;
  }

  /** Evaluate the four threshold metrics for one VPS sample. */
  evaluate(vps: string, v: MetricValues, ts: number): void {
    const th = this.getThresholds(vps);
    const limits: Record<keyof MetricValues, number> = {
      cpu_pct: th.cpu_pct, mem_pct: th.mem_pct,
      disk_pct: th.disk_pct, traffic_pct: th.traffic_pct,
    };
    for (const metric of Object.keys(limits) as (keyof MetricValues)[]) {
      this.step(vps, metric, v[metric], limits[metric], ts);
    }
  }

  /** Record that a VPS agent's data arrived at time ts. */
  markSeen(vps: string, ts: number): void {
    const key = `${vps}|offline`;
    const c = this.cell(key);
    this.lastSeen.set(vps, ts);
    if (c.state === "alerting") {
      c.state = "ok"; c.over = 0; c.under = 0;
      this.onEvent({ vps_id: vps, metric: "offline", event: "recovered", value: 0, ts });
      void this.notifier.send(vps, `🟢 [${vps}] ${LABELS.offline} 已恢复（agent 重新上报）`);
    }
  }

  /** Fire offline alerts for VPS not seen within offline_seconds. */
  checkOffline(now: number): void {
    for (const [vps, seen] of this.lastSeen) {
      const limit = this.getThresholds(vps).offline_seconds;
      const c = this.cell(`${vps}|offline`);
      const stale = now - seen > limit;
      if (stale && c.state === "ok") {
        c.state = "alerting";
        this.onEvent({ vps_id: vps, metric: "offline", event: "triggered", value: now - seen, ts: now });
        void this.notifier.send(vps, `🔴 [${vps}] agent 已离线（超过 ${limit}s 无数据）`);
      }
    }
  }

  /** Metrics currently in the alerting state, per VPS — for the frontend. */
  snapshot(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [key, c] of this.cells) {
      if (c.state !== "alerting") continue;
      const [vps, metric] = key.split("|");
      (out[vps] ??= []).push(metric);
    }
    return out;
  }

  /** Forget all runtime state when a user removes a dynamically managed VPS. */
  remove(vps: string): void {
    this.lastSeen.delete(vps);
    for (const key of this.cells.keys()) {
      if (key.startsWith(`${vps}|`)) this.cells.delete(key);
    }
  }

  private step(vps: string, metric: string, value: number, limit: number, ts: number): void {
    const c = this.cell(`${vps}|${metric}`);
    if (value >= limit) {
      c.over++; c.under = 0;
      if (c.state === "ok" && c.over >= 2) {
        c.state = "alerting";
        this.onEvent({ vps_id: vps, metric, event: "triggered", value, ts });
        void this.notifier.send(vps,
          `🔴 [${vps}] ${LABELS[metric] ?? metric} ${value.toFixed(1)}% 超过阈值 ${limit}%`);
      }
    } else {
      c.under++; c.over = 0;
      if (c.state === "alerting" && c.under >= 2) {
        c.state = "ok";
        this.onEvent({ vps_id: vps, metric, event: "recovered", value, ts });
        void this.notifier.send(vps,
          `🟢 [${vps}] ${LABELS[metric] ?? metric} 已恢复（当前 ${value.toFixed(1)}%）`);
      }
    }
  }
}
