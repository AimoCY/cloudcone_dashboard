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
    expect(c.agents[0].owner_user_id).toBe("admin");
    expect(c.users[0]).toMatchObject({ id: "admin", username: "admin", role: "admin" });
    expect(c.thresholds.cpu_pct).toBe(90);
  });
  it("parses users and validates agent ownership", () => {
    const body = JSON.parse(full);
    delete body.admin_password_hash;
    body.users = [
      { id: "root", username: "root", password_hash: "hash-a", role: "admin" },
      { id: "alice", username: "alice", password_hash: "hash-b", role: "user" },
    ];
    body.agents[0].owner_user_id = "alice";
    const c = loadConfig(tmpConfig(JSON.stringify(body)));
    expect(c.agents[0].owner_user_id).toBe("alice");

    body.agents[0].owner_user_id = "missing";
    expect(() => loadConfig(tmpConfig(JSON.stringify(body)))).toThrow();
  });
  it("allows a fresh dashboard with no agents before self-service onboarding", () => {
    const body = JSON.parse(full);
    body.agents = [];
    expect(loadConfig(tmpConfig(JSON.stringify(body))).agents).toEqual([]);
  });
  it("rejects configured usernames that differ only by case", () => {
    const body = JSON.parse(full);
    delete body.admin_password_hash;
    body.users = [
      { id: "root", username: "Admin", password_hash: "hash-a", role: "admin" },
      { id: "other", username: "admin", password_hash: "hash-b", role: "user" },
    ];
    expect(() => loadConfig(tmpConfig(JSON.stringify(body)))).toThrow();
  });
  it("rejects missing session_secret", () => {
    const bad = JSON.parse(full);
    delete bad.session_secret;
    expect(() => loadConfig(tmpConfig(JSON.stringify(bad)))).toThrow();
  });
});
