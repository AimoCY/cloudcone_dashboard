import type { ReactNode } from "react";
import { api } from "../api.js";
import { useDark, setDark } from "../theme.js";
import type { CurrentUser } from "../types.js";

const LINKS = [
  { id: "fleet", label: "Fleet", href: "#/" },
  { id: "agents", label: "VPS 管理", href: "#/agents" },
  { id: "alerts", label: "Alerts", href: "#/alerts" },
  { id: "settings", label: "Settings", href: "#/settings" },
];

// Shared top navigation bar. `active` is one of the link ids; `right` holds
// optional page-specific content shown before the theme/logout controls.
export function TopNav({ active, user, right }: { active: string; user: CurrentUser; right?: ReactNode }) {
  const dark = useDark();
  return (
    <nav className="topnav">
      <div className="row gap-24">
        <a href="#/" className="logo" style={{ textDecoration: "none" }}>
          <span className="mark" />
          <span>VPSCONE</span>
        </a>
        <div className="topnav__links">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={l.href}
              className={`topnav__link ${active === l.id ? "is-active" : ""}`}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <div className="row gap-12">
        {right}
        <span className="chip on mono" title={user.role === "admin" ? "管理员" : "普通用户"}>
          {user.username}{user.role === "admin" ? " · admin" : ""}
        </span>
        <button className="btn ghost" onClick={() => setDark(!dark)}>
          {dark ? "☀ Light" : "☾ Dark"}
        </button>
        <button className="btn ghost" onClick={() => api.logout().then(() => location.reload())}>
          Logout
        </button>
      </div>
    </nav>
  );
}
