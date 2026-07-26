import { useState, type FormEvent } from "react";
import { api } from "../api.js";
import type { CurrentUser } from "../types.js";

type Mode = "login" | "register";

export function Login({ onSuccess }: { onSuccess: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setUsername(next === "login" ? "admin" : "");
    setPassword("");
    setConfirm("");
    setInviteCode("");
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        const user = await api.login(username, password);
        if (user) onSuccess(user);
        else setError("用户名或密码错误");
      } else {
        if (password !== confirm) {
          setError("两次输入的密码不一致");
        } else {
          const result = await api.register(username, password, inviteCode);
          if (result.user) onSuccess(result.user);
          else setError(result.error);
        }
      }
    } catch {
      setError("网络请求失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  const ready = username.trim() && password
    && (mode === "login" || (confirm && inviteCode.trim()));

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <div className="logo"><span className="mark" /><span>VPSCONE</span></div>
        <h1>{mode === "login" ? "VPS 监控登录" : "邀请码注册"}</h1>
        {mode === "register" && (
          <input
            className="input mono"
            value={inviteCode}
            placeholder="一次性邀请码"
            autoComplete="off"
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            autoFocus
          />
        )}
        <input
          className="input"
          value={username}
          placeholder="用户名（3-32 位）"
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          autoFocus={mode === "login"}
        />
        <input
          className="input"
          type="password"
          value={password}
          placeholder={mode === "login" ? "密码" : "密码（至少 8 位）"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <input
            className="input"
            type="password"
            value={confirm}
            placeholder="再次输入密码"
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        <button className="btn primary" type="submit" disabled={busy || !ready}>
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
        {error && <p className="error">{error}</p>}
        <button
          className="btn ghost"
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "已有邀请码？注册账号" : "已有账号？返回登录"}
        </button>
      </form>
    </div>
  );
}
