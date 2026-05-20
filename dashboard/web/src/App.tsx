import { useEffect, useState } from "react";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { api } from "./api.js";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api.overview().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="centered">加载中…</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Dashboard />;
}
