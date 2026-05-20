import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./config.js";

function tmpConfig(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  const p = join(dir, "config.json");
  writeFileSync(p, body);
  return p;
}

const full = JSON.stringify({
  listen_port: 8787,
  public_port: 9443,
  admin_password_hash: "$2a$10$abcdefghijklmnopqrstuv",
  session_secret: "a-very-long-session-secret-string",
  retention_days: 7,
  db_path: "/tmp/test.db",
  agents: [{ id: "vps-a", label: "VPS-A", token: "tok-a", traffic_quota_gb: 1000 }],
  thresholds: { cpu_pct: 90, mem_pct: 90, disk_pct: 90, traffic_pct: 90, offline_seconds: 60 },
  telegram: { bot_token: "bt", chat_id: "cid" },
});

describe("loadConfig", () => {
  it("parses a full config", () => {
    const c = loadConfig(tmpConfig(full));
    expect(c.agents[0].id).toBe("vps-a");
    expect(c.thresholds.cpu_pct).toBe(90);
  });
  it("rejects config with no agents", () => {
    const bad = JSON.parse(full);
    bad.agents = [];
    expect(() => loadConfig(tmpConfig(JSON.stringify(bad)))).toThrow();
  });
  it("rejects missing session_secret", () => {
    const bad = JSON.parse(full);
    delete bad.session_secret;
    expect(() => loadConfig(tmpConfig(JSON.stringify(bad)))).toThrow();
  });
});
