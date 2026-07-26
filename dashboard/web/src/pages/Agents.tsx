import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import type { CurrentUser, ManagedAgent, OverviewRow } from "../types.js";
import { TopNav } from "../components/TopNav.js";

const INSTALLER = "https://raw.githubusercontent.com/AimoCY/cloudcone_dashboard/main/deploy/install-agent-remote.sh";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function Provision({ agent, token, onClose }: {
  agent: ManagedAgent; token: string; onClose: () => void;
}) {
  const [dashboardUrl, setDashboardUrl] = useState(`${location.origin}/ingest`);
  const command = useMemo(() =>
    `curl -fsSL ${shellQuote(INSTALLER)} | sudo `
    + `VPS_ID=${shellQuote(agent.id)} TOKEN=${shellQuote(token)} `
    + `DASHBOARD_URL=${shellQuote(dashboardUrl)} LABEL=${shellQuote(agent.label)} `
    + `TRAFFIC_RESET_DAY=${agent.traffic_reset_day} bash`,
  [agent, token, dashboardUrl]);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card col gap-12" style={{ borderColor: "var(--primary)", marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="col gap-2">
          <span className="h-eyebrow">Agent 一键接入</span>
          <h2>{agent.label}</h2>
        </div>
        <button className="btn ghost" onClick={onClose}>关闭并隐藏 Token</button>
      </div>
      <p className="mut" style={{ fontSize: 12, lineHeight: 1.6 }}>
        在目标 Linux VPS 上以可执行 sudo 的用户运行下面命令。Token 只在本次显示；关闭后如需再次安装，请轮换 Token。
      </p>
      <label className="col gap-4">
        <span className="h-eyebrow">Dashboard 上报地址</span>
        <input className="input mono" value={dashboardUrl} onChange={(e) => setDashboardUrl(e.target.value)} />
      </label>
      <textarea className="input mono" readOnly value={command} rows={6}
        style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }} />
      <div className="row gap-8">
        <button className="btn primary" onClick={copy}>{copied ? "已复制" : "复制安装命令"}</button>
        <span className="mono mut" style={{ fontSize: 11 }}>VPS ID: {agent.id}</span>
      </div>
    </div>
  );
}

function AgentCard({ agent, overview, onSaved, onProvision, onDeleted }: {
  agent: ManagedAgent;
  overview?: OverviewRow;
  onSaved: (agent: ManagedAgent) => void;
  onProvision: (agent: ManagedAgent, token: string) => void;
  onDeleted: (id: string) => void;
}) {
  const editable = agent.source === "user";
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(agent.label);
  const [quota, setQuota] = useState(agent.traffic_quota_gb);
  const [resetDay, setResetDay] = useState(agent.traffic_reset_day);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      const updated = await api.updateAgent(agent.id, {
        label, traffic_quota_gb: quota, traffic_reset_day: resetDay,
      });
      onSaved(updated); setEditing(false);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function rotate() {
    if (!confirm(`轮换 ${agent.label} 的 Token？旧 agent 会立即停止上报，直到使用新命令重新配置。`)) return;
    setBusy(true); setError("");
    try {
      const result = await api.rotateAgentToken(agent.id);
      onProvision(agent, result.token);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`删除 ${agent.label}？该 Token 会立即失效。历史采样暂时保留。`)) return;
    setBusy(true); setError("");
    const ok = await api.deleteAgent(agent.id);
    setBusy(false);
    if (ok) onDeleted(agent.id); else setError("删除失败");
  }

  return (
    <div className="card col gap-10">
      <div className="row resp-stack" style={{ justifyContent: "space-between", gap: 12 }}>
        <div className="col gap-2">
          <div className="row gap-8">
            <span className={`dot ${overview?.online ? "ok" : "off"}`} />
            <h3>{agent.label}</h3>
            <span className="tag">{agent.source === "config" ? "配置托管" : "用户创建"}</span>
          </div>
          <span className="mono mut" style={{ fontSize: 11 }}>
            {agent.id} · 所有者 {agent.owner_username} · {overview?.online ? "在线" : "离线/待接入"}
          </span>
        </div>
        <div className="row gap-8">
          {editable && <button className="btn ghost" disabled={busy} onClick={() => setEditing(!editing)}>编辑</button>}
          {editable && <button className="btn ghost" disabled={busy} onClick={rotate}>轮换 Token</button>}
          {editable && <button className="btn ghost" disabled={busy} onClick={remove}>删除</button>}
        </div>
      </div>

      {editing ? (
        <div className="row resp-stack gap-12" style={{ alignItems: "flex-end" }}>
          <label className="col gap-4 grow"><span className="h-eyebrow">名称</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="col gap-4"><span className="h-eyebrow">流量配额 GB</span>
            <input className="input num" type="number" value={quota} onChange={(e) => setQuota(Number(e.target.value))} /></label>
          <label className="col gap-4"><span className="h-eyebrow">计费起始日</span>
            <input className="input num" type="number" min={1} max={28} value={resetDay}
              onChange={(e) => setResetDay(Number(e.target.value))} /></label>
          <button className="btn primary" disabled={busy || !label.trim()} onClick={save}>保存</button>
        </div>
      ) : (
        <div className="row gap-24 mono mut" style={{ fontSize: 11 }}>
          <span>配额 {agent.traffic_quota_gb} GB</span><span>每月 {agent.traffic_reset_day} 日重置</span>
          {!editable && <span>由服务器配置文件引导，需在配置文件中修改</span>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Agents({ user }: { user: CurrentUser }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState("");
  const [quota, setQuota] = useState(1000);
  const [resetDay, setResetDay] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provision, setProvision] = useState<{ agent: ManagedAgent; token: string } | null>(null);

  function load() {
    Promise.all([api.agents(), api.overview()])
      .then(([a, o]) => { setAgents(a); setOverview(o); setLoaded(true); setError(""); })
      .catch((e) => setError(String(e)));
  }
  useEffect(load, []);

  async function create() {
    setBusy(true); setError("");
    try {
      const result = await api.createAgent({ label, traffic_quota_gb: quota, traffic_reset_day: resetDay });
      setAgents((v) => [...v, result.agent]);
      setProvision(result);
      setLabel("");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="app">
      <TopNav active="agents" user={user} right={<span className="chip">{agents.length} 台 VPS</span>} />
      <div className="section col gap-4">
        <span className="h-eyebrow">VPS Management</span>
        <h1>添加和管理我的 VPS</h1>
        <p className="mut" style={{ fontSize: 12 }}>创建监控项后，在目标 VPS 运行一次安装命令即可开始上报。</p>
      </div>
      <div className="section">
        {provision && <Provision {...provision} onClose={() => setProvision(null)} />}
        <div className="card col gap-12">
          <div className="col gap-2"><span className="h-eyebrow">添加 VPS</span><h2>创建新的监控项</h2></div>
          <div className="row resp-stack gap-12" style={{ alignItems: "flex-end" }}>
            <label className="col gap-4 grow"><span className="h-eyebrow">显示名称</span>
              <input className="input" value={label} placeholder="例如 Tokyo-Web-01"
                onChange={(e) => setLabel(e.target.value)} /></label>
            <label className="col gap-4"><span className="h-eyebrow">流量配额 GB</span>
              <input className="input num" type="number" value={quota}
                onChange={(e) => setQuota(Number(e.target.value))} /></label>
            <label className="col gap-4"><span className="h-eyebrow">计费起始日</span>
              <input className="input num" type="number" min={1} max={28} value={resetDay}
                onChange={(e) => setResetDay(Number(e.target.value))} /></label>
            <button className="btn primary" disabled={busy || !label.trim()} onClick={create}>
              {busy ? "创建中…" : "创建并生成命令"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
      <div className="section col gap-10" style={{ borderBottom: "none" }}>
        <span className="h-eyebrow">Managed VPS</span>
        {loaded && agents.length === 0 && <p className="mut">还没有 VPS，先创建一个监控项。</p>}
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} overview={overview.find((o) => o.vps_id === agent.id)}
            onSaved={(next) => setAgents((all) => all.map((a) => a.id === next.id ? next : a))}
            onProvision={(a, token) => setProvision({ agent: a, token })}
            onDeleted={(id) => { setAgents((all) => all.filter((a) => a.id !== id)); setProvision(null); }} />
        ))}
      </div>
    </div>
  );
}
