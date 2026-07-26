import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { AlertLogRow, CurrentUser } from "../types.js";
import { useOverview } from "../hooks.js";
import { metricLabel, fmtTime } from "../format.js";
import { TopNav } from "../components/TopNav.js";

type Filter = "all" | "triggered" | "recovered";

function eventValue(e: AlertLogRow): string {
  if (e.metric === "offline") {
    return e.event === "triggered" ? `${Math.round(e.value)}s 无数据` : "已恢复上报";
  }
  return `${e.value.toFixed(0)}%`;
}

export function Alerts({ user }: { user: CurrentUser }) {
  const { rows } = useOverview();
  const [log, setLog] = useState<AlertLogRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<AlertLogRow | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => api.alertLog().then((l) => alive && setLog(l)).catch(() => {});
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const labelOf = (vps: string) => rows.find((r) => r.vps_id === vps)?.label ?? vps;
  const firing = rows.reduce((a, r) => a + r.alerting.length, 0);
  const shown = log.filter((e) => filter === "all" || e.event === filter);
  const sel = selected ?? shown[0] ?? null;
  const related = sel ? log.filter((e) => e.vps_id === sel.vps_id && e.metric === sel.metric).slice(0, 12) : [];

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "triggered", label: "触发" },
    { id: "recovered", label: "恢复" },
  ];

  return (
    <div className="app">
      <TopNav active="alerts" user={user} right={
        firing > 0
          ? <span className="chip bad"><span className="dot bad" />{firing} 告警中</span>
          : <span className="chip"><span className="dot ok" />全部正常</span>
      } />

      <div className="section">
        <div className="row resp-stack" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div className="col gap-2">
            <span className="h-eyebrow">Alerts</span>
            <h1 className="mono">{firing} 项告警中 · 最近 {log.length} 条事件</h1>
          </div>
          <div className="row gap-6">
            {filters.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`chip ${filter === f.id ? "on" : ""}`}
                style={{ cursor: "pointer", background: "transparent" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row resp-stack" style={{ alignItems: "stretch", flex: 1 }}>
        {/* Event list */}
        <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
          {shown.length === 0 && (
            <div className="section" style={{ borderBottom: "none" }}>
              <p className="mut">还没有告警事件 — 一切正常。</p>
            </div>
          )}
          {shown.map((e) => {
            const on = sel?.id === e.id;
            const trig = e.event === "triggered";
            return (
              <button key={e.id} onClick={() => setSelected(e)}
                className="row gap-12"
                style={{
                  padding: "12px 28px", gap: 14, textAlign: "left", cursor: "pointer",
                  border: "none", borderBottom: "1px solid var(--line-2)",
                  borderLeft: `3px solid ${trig ? "var(--red)" : "var(--green)"}`,
                  background: on ? "var(--bg-3)" : "transparent",
                }}>
                <span className={`dot ${trig ? "bad" : "ok"}`} />
                <span className="mono mut" style={{ fontSize: 11, width: 116 }}>{fmtTime(e.ts)}</span>
                <div className="col grow" style={{ gap: 1 }}>
                  <div className="row gap-8">
                    <span className="mono strong" style={{ fontSize: 12 }}>{labelOf(e.vps_id)}</span>
                    <span className="mono mut" style={{ fontSize: 11 }}>{metricLabel(e.metric)}</span>
                  </div>
                  <span className={`mono ${trig ? "bad" : "ok"}`} style={{ fontSize: 11 }}>{eventValue(e)}</span>
                </div>
                <span className="tag" style={{
                  color: trig ? "var(--red)" : "var(--green)",
                  borderColor: trig ? "var(--red)" : "var(--green)",
                }}>{trig ? "triggered" : "recovered"}</span>
              </button>
            );
          })}
        </div>

        {/* Detail rail */}
        <div className="bdL" style={{ width: 340, flex: "0 0 340px", padding: 22 }}>
          {sel ? (
            <div className="col gap-14">
              <div className="col gap-2">
                <span className="h-eyebrow">{labelOf(sel.vps_id)} · {metricLabel(sel.metric)}</span>
                <div className="row gap-8" style={{ alignItems: "baseline" }}>
                  <span className={`mono ${sel.event === "triggered" ? "bad" : "ok"}`}
                    style={{ fontSize: 26, fontWeight: 500 }}>{eventValue(sel)}</span>
                  <span className="mono mut" style={{ fontSize: 11 }}>{fmtTime(sel.ts)}</span>
                </div>
              </div>
              <div className="col gap-2">
                <span className="h-eyebrow">该指标近期事件</span>
                {related.map((e) => (
                  <div key={e.id} className="row gap-8" style={{ fontSize: 11 }}>
                    <span className={`dot ${e.event === "triggered" ? "bad" : "ok"}`} />
                    <span className="mono mut" style={{ width: 116 }}>{fmtTime(e.ts)}</span>
                    <span className="mono">{e.event === "triggered" ? "触发" : "恢复"} · {eventValue(e)}</span>
                  </div>
                ))}
              </div>
              <a href={`#/server/${sel.vps_id}`} className="btn primary" style={{ textDecoration: "none" }}>
                打开服务器
              </a>
            </div>
          ) : (
            <p className="mut" style={{ fontSize: 12 }}>选择左侧事件查看详情。</p>
          )}
        </div>
      </div>
    </div>
  );
}
