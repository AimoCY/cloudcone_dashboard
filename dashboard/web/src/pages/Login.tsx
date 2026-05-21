import { useState, type FormEvent } from "react";
import { api } from "../api.js";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ok = await api.login(password);
    setBusy(false);
    if (ok) onSuccess();
    else setError("密码错误");
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <div className="logo"><span className="mark" /><span>VPSCONE</span></div>
        <h1>VPS 监控登录</h1>
        <input
          className="input"
          type="password"
          value={password}
          placeholder="管理员密码"
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "登录中…" : "登录"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
