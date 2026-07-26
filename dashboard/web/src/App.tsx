import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useHashRoute } from "./router.js";
import { Login } from "./pages/Login.js";
import { Fleet } from "./pages/Fleet.js";
import { ServerDetail } from "./pages/ServerDetail.js";
import { Alerts } from "./pages/Alerts.js";
import { Settings } from "./pages/Settings.js";
import { Agents } from "./pages/Agents.js";
import type { CurrentUser } from "./types.js";

export function App() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const route = useHashRoute();

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="centered">加载中…</div>;
  if (!user) return <Login onSuccess={setUser} />;

  if (route.startsWith("/server/")) {
    return <ServerDetail vpsId={decodeURIComponent(route.slice("/server/".length))} user={user} />;
  }
  if (route === "/agents") return <Agents user={user} />;
  if (route === "/alerts") return <Alerts user={user} />;
  if (route === "/settings") return <Settings user={user} />;
  return <Fleet user={user} />;
}
