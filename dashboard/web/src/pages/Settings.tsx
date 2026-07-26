import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api.js";
import type { CurrentUser, Invite, SettingsView, SettingsPatch, Thresholds } from "../types.js";
import { TopNav } from "../components/TopNav.js";
import { useDark, setDark } from "../theme.js";

const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: string }[] = [
  { key: "cpu_pct", label: "CPU 使用率", unit: "%" },
  { key: "mem_pct", label: "内存使用率", unit: "%" },
  { key: "disk_pct", label: "磁盘使用率", unit: "%" },
  { key: "traffic_pct", label: "流量占配额", unit: "%" },
  { key: "offline_seconds", label: "Agent 离线判定", unit: "秒" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row gap-12" style={{ minHeight: 30 }}>
      <span className="mut" style={{ width: 140, fontSize: 12, flex: "0 0 140px" }}>{label}</span>
      {children}
    </div>
  );
}

export function Settings({ user }: { user: CurrentUser }) {
  const dark = useDark();
  const [view, setView] = useState<SettingsView | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [retention, setRetention] = useState(7);
  const [chatId, setChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [email, setEmail] = useState({ smtp_host: "", smtp_port: 587, smtp_user: "", from: "", recipients: "" });
  const [smtpPass, setSmtpPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteDays, setInviteDays] = useState(7);
  const [newInvite, setNewInvite] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");

  const refs = {
    th: useRef<HTMLDivElement>(null),
    ch: useRef<HTMLDivElement>(null),
    iv: useRef<HTMLDivElement>(null),
    bi: useRef<HTMLDivElement>(null),
    tm: useRef<HTMLDivElement>(null),
  };

  function load() {
    api.getSettings().then((s) => {
      setView(s);
      setThresholds({ ...s.thresholds });
      setRetention(s.retention_days);
      setChatId(s.telegram.chat_id);
      setEmail({
        smtp_host: s.email.smtp_host, smtp_port: s.email.smtp_port,
        smtp_user: s.email.smtp_user, from: s.email.from, recipients: s.email.recipients,
      });
      setBotToken("");
      setSmtpPass("");
    }).catch((e) => setStatus(String(e)));
  }
  useEffect(load, []);
  useEffect(() => {
    if (user.role === "admin") api.invites().then(setInvites).catch(() => {});
  }, [user.role]);

  async function generateInvite() {
    setInviteBusy(true); setInviteStatus(""); setNewInvite("");
    try {
      const created = await api.createInvite(inviteDays);
      setNewInvite(created.code);
      setInvites(await api.invites());
    } catch (e) { setInviteStatus(String(e)); }
    finally { setInviteBusy(false); }
  }

  async function revokeInvite(id: string) {
    if (!confirm("撤销这个尚未使用的邀请码？")) return;
    const ok = await api.revokeInvite(id);
    if (ok) setInvites((all) => all.filter((i) => i.id !== id));
    else setInviteStatus("撤销失败，邀请码可能已经被使用");
  }

  async function save() {
    if (!thresholds) return;
    setSaving(true);
    setStatus("");
    const patch: SettingsPatch = {
      thresholds,
      ...(view?.retention_editable ? { retention_days: retention } : {}),
      telegram: { chat_id: chatId, ...(botToken ? { bot_token: botToken } : {}) },
      email: { ...email, ...(smtpPass ? { smtp_pass: smtpPass } : {}) },
    };
    const ok = await api.putSettings(patch);
    setSaving(false);
    setStatus(ok ? "已保存" : "保存失败");
    if (ok) load();
  }

  const nav = [
    { r: refs.th, label: "阈值" },
    { r: refs.ch, label: "通知通道" },
    ...(user.role === "admin" ? [{ r: refs.iv, label: "注册邀请码" }] : []),
    { r: refs.bi, label: "计费与保留" },
    { r: refs.tm, label: "主题" },
  ];

  return (
    <div className="app">
      <TopNav active="settings" user={user} right={
        <>
          {status && <span className={`mono ${status === "已保存" ? "ok" : "bad"}`} style={{ fontSize: 12 }}>{status}</span>}
          <button className="btn primary" onClick={save} disabled={saving || !thresholds}>
            {saving ? "保存中…" : "保存更改"}
          </button>
        </>
      } />

      <div className="row resp-stack" style={{ alignItems: "stretch", flex: 1 }}>
        {/* sub-nav */}
        <div className="bdR" style={{ width: 180, flex: "0 0 180px", padding: "20px 0" }}>
          {nav.map((n) => (
            <button key={n.label} onClick={() => n.r.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 24px",
                fontSize: 13, color: "var(--mut)", background: "transparent", border: "none",
                borderLeft: "2px solid transparent", cursor: "pointer",
              }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="grow" style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
          {!thresholds && <p className="mut">加载中…</p>}

          {thresholds && (
            <>
              {/* Thresholds */}
              <section ref={refs.th} className="col gap-10">
                <div className="col gap-2">
                  <span className="h-eyebrow">告警阈值</span>
                  <h2>指标超过以下值时告警</h2>
                  <span className="mut" style={{ fontSize: 11 }}>每条规则均应用 2 样本迟滞防抖</span>
                </div>
                <div className="col gap-6" style={{ maxWidth: 420 }}>
                  {THRESHOLD_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <input className="input num" type="number"
                        value={thresholds[f.key]}
                        onChange={(e) => setThresholds({ ...thresholds, [f.key]: Number(e.target.value) })} />
                      <span className="mut" style={{ fontSize: 11 }}>{f.unit}</span>
                    </Field>
                  ))}
                </div>
              </section>

              {/* Channels */}
              <section ref={refs.ch} className="col gap-10" style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                <div className="col gap-2">
                  <span className="h-eyebrow">通知通道</span>
                  <h2>告警推送到哪里</h2>
                </div>
                <div className="row resp-stack gap-16" style={{ alignItems: "flex-start" }}>
                  <div className="card grow" style={{ maxWidth: 460 }}>
                    <h3>Telegram</h3>
                    <Field label="Bot Token">
                      <input className="input grow" type="password"
                        placeholder={view?.telegram.bot_token_set ? "已配置 · 留空则不变" : "未配置"}
                        value={botToken} onChange={(e) => setBotToken(e.target.value)} />
                    </Field>
                    <Field label="Chat ID">
                      <input className="input grow" value={chatId} onChange={(e) => setChatId(e.target.value)} />
                    </Field>
                  </div>
                  <div className="card grow" style={{ maxWidth: 460 }}>
                    <h3>Email (SMTP)</h3>
                    <Field label="SMTP 主机">
                      <input className="input grow" value={email.smtp_host}
                        placeholder="smtp.example.com"
                        onChange={(e) => setEmail({ ...email, smtp_host: e.target.value })} />
                    </Field>
                    <Field label="端口">
                      <input className="input num" type="number" value={email.smtp_port}
                        onChange={(e) => setEmail({ ...email, smtp_port: Number(e.target.value) })} />
                    </Field>
                    <Field label="用户名">
                      <input className="input grow" value={email.smtp_user}
                        onChange={(e) => setEmail({ ...email, smtp_user: e.target.value })} />
                    </Field>
                    <Field label="密码">
                      <input className="input grow" type="password"
                        placeholder={view?.email.smtp_pass_set ? "已配置 · 留空则不变" : "未配置"}
                        value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                    </Field>
                    <Field label="发件人">
                      <input className="input grow" value={email.from}
                        onChange={(e) => setEmail({ ...email, from: e.target.value })} />
                    </Field>
                    <Field label="收件人">
                      <input className="input grow" value={email.recipients}
                        placeholder="逗号分隔多个地址"
                        onChange={(e) => setEmail({ ...email, recipients: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </section>

              {/* Invitation-only registration */}
              {user.role === "admin" && (
                <section ref={refs.iv} className="col gap-10" style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                  <div className="col gap-2">
                    <span className="h-eyebrow">邀请注册</span>
                    <h2>生成一次性注册邀请码</h2>
                    <span className="mut" style={{ fontSize: 11 }}>邀请码使用一次即失效，明文只在生成时显示。</span>
                  </div>
                  <div className="row gap-8" style={{ alignItems: "flex-end" }}>
                    <label className="col gap-4">
                      <span className="h-eyebrow">有效期</span>
                      <div className="row gap-4">
                        <input className="input num" type="number" min={1} max={30} value={inviteDays}
                          onChange={(e) => setInviteDays(Number(e.target.value))} />
                        <span className="mut" style={{ fontSize: 11 }}>天</span>
                      </div>
                    </label>
                    <button className="btn primary" disabled={inviteBusy} onClick={generateInvite}>
                      {inviteBusy ? "生成中…" : "生成邀请码"}
                    </button>
                  </div>
                  {newInvite && (
                    <div className="card col gap-8" style={{ maxWidth: 620, borderColor: "var(--primary)" }}>
                      <span className="h-eyebrow">新邀请码 · 请立即保存</span>
                      <span className="mono" style={{ fontSize: 20, wordBreak: "break-all" }}>{newInvite}</span>
                      <div className="row gap-8">
                        <button className="btn primary" onClick={() => navigator.clipboard.writeText(newInvite)}>复制邀请码</button>
                        <button className="btn ghost" onClick={() => setNewInvite("")}>隐藏</button>
                      </div>
                    </div>
                  )}
                  {inviteStatus && <p className="error">{inviteStatus}</p>}
                  <div className="col gap-6" style={{ maxWidth: 760 }}>
                    <span className="h-eyebrow">最近邀请码</span>
                    {invites.length === 0 && <span className="mut" style={{ fontSize: 11 }}>尚未生成邀请码。</span>}
                    {invites.map((invite) => {
                      const expired = invite.expires_at <= Math.floor(Date.now() / 1000);
                      const state = invite.used_at ? `已由 ${invite.used_by_username ?? "用户"} 使用` : expired ? "已过期" : "待使用";
                      return (
                        <div key={invite.id} className="row gap-12" style={{ padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
                          <span className={`dot ${invite.used_at || expired ? "off" : "ok"}`} />
                          <span className="mono grow" style={{ fontSize: 11 }}>{state}</span>
                          <span className="mono mut" style={{ fontSize: 10 }}>
                            到期 {new Date(invite.expires_at * 1000).toLocaleString()}
                          </span>
                          {!invite.used_at && !expired && (
                            <button className="btn ghost" onClick={() => revokeInvite(invite.id)}>撤销</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Billing & retention */}
              <section ref={refs.bi} className="col gap-10" style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                <div className="col gap-2">
                  <span className="h-eyebrow">计费与保留</span>
                  <h2>历史数据与流量周期</h2>
                </div>
                <div className="col gap-6" style={{ maxWidth: 460 }}>
                  <Field label="历史保留">
                    <input className="input num" type="number" value={retention}
                      disabled={!view?.retention_editable}
                      onChange={(e) => setRetention(Number(e.target.value))} />
                    <span className="mut" style={{ fontSize: 11 }}>天 · SQLite</span>
                  </Field>
                  {!view?.retention_editable && (
                    <p className="mut" style={{ fontSize: 11 }}>历史保留天数由管理员统一管理。</p>
                  )}
                  <p className="mut" style={{ fontSize: 11, lineHeight: 1.6 }}>
                    每台 VPS 的流量配额和计费起始日可在“VPS 管理”页面修改；配置文件引导的旧 VPS
                    仍需在服务器配置文件中调整。
                  </p>
                </div>
              </section>

              {/* Theme */}
              <section ref={refs.tm} className="col gap-10" style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                <div className="col gap-2">
                  <span className="h-eyebrow">主题</span>
                  <h2>外观</h2>
                </div>
                <Field label="深色模式">
                  <button className={`toggle ${dark ? "on" : ""}`} onClick={() => setDark(!dark)}>
                    <span />
                  </button>
                </Field>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
