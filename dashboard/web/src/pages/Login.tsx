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
    <form onSubmit={submit} className="login-card">
      <h1>VPS 监控</h1>
      <input
        type="password"
        value={password}
        placeholder="管理员密码"
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <button type="submit" disabled={busy || !password}>
        {busy ? "登录中…" : "登录"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
