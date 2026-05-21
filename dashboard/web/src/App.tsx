import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useHashRoute } from "./router.js";
import { Login } from "./pages/Login.js";
import { Fleet } from "./pages/Fleet.js";
import { ServerDetail } from "./pages/ServerDetail.js";
import { Alerts } from "./pages/Alerts.js";
import { Settings } from "./pages/Settings.js";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const route = useHashRoute();

  useEffect(() => {
    api.overview().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="centered">加载中…</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  if (route.startsWith("/server/")) {
    return <ServerDetail vpsId={decodeURIComponent(route.slice("/server/".length))} />;
  }
  if (route === "/alerts") return <Alerts />;
  if (route === "/settings") return <Settings />;
  return <Fleet />;
}
