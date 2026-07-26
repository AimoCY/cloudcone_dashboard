import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { mountAuth, requireSession } from "./auth.js";
import { openDb } from "./db.js";
import { hashSecret } from "./secrets.js";

function setup() {
  const db = openDb(":memory:");
  db.upsertBootstrapUser({
    id: "admin", username: "admin", password_hash: bcrypt.hashSync("correct-horse", 10), role: "admin",
  }, 1);
  db.upsertBootstrapUser({
    id: "alice", username: "alice", password_hash: bcrypt.hashSync("alice-pass", 10), role: "user",
  }, 2);
  const cfg = { db, sessionSecret: "secret-secret-secret-secret" };
  const app = new Hono();
  mountAuth(app, cfg);
  app.get("/api/secret", requireSession(cfg), (c) => c.json(c.get("authUser")));
  return { app, db };
}

describe("auth", () => {
  it("rejects /api with no session cookie", async () => {
    const res = await setup().app.request("/api/secret");
    expect(res.status).toBe(401);
  });

  it("logs in with the correct password and then allows /api", async () => {
    const { app } = setup();
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "correct-horse" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session=");
    const res = await app.request("/api/secret", { headers: { cookie: cookie.split(";")[0] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "admin", username: "admin", role: "admin" });
  });

  it("stores the logged-in normal user's identity in the session", async () => {
    const { app } = setup();
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "alice-pass" }),
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    const res = await app.request("/api/secret", { headers: { cookie: cookie.split(";")[0] } });
    expect(await res.json()).toMatchObject({ id: "alice", role: "user" });
  });

  it("registers with a valid one-time invite and starts a session", async () => {
    const { app, db } = setup();
    const code = "ABCDEF-GHIJKL-MNOPQR-STUVWX";
    const now = Math.floor(Date.now() / 1000);
    db.createInvite({
      id: "invite-1", code_hash: hashSecret(code), created_by: "admin",
      created_at: now, expires_at: now + 3600,
    });
    const register = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "new-user", password: "new-password", invite_code: code.toLowerCase() }),
    });
    expect(register.status).toBe(201);
    expect(await register.json()).toMatchObject({ username: "new-user", role: "user" });
    expect(register.headers.get("set-cookie")).toContain("session=");

    const reused = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "other-user", password: "new-password", invite_code: code }),
    });
    expect(reused.status).toBe(400);
  });

  it("rejects invalid registration input and an invalid invite", async () => {
    const { app } = setup();
    const badName = await app.request("/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x", password: "long-enough", invite_code: "bad" }),
    });
    expect(badName.status).toBe(400);
    const badInvite = await app.request("/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "valid-user", password: "long-enough", invite_code: "bad" }),
    });
    expect(badInvite.status).toBe(400);
    expect(await badInvite.json()).toMatchObject({ error: "invalid or expired invite" });
  });

  it("rejects a wrong password", async () => {
    const login = await setup().app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });
    expect(login.status).toBe(401);
  });

  it("rejects a forged/garbage session cookie", async () => {
    const res = await setup().app.request("/api/secret", { headers: { cookie: "session=forged" } });
    expect(res.status).toBe(401);
  });
});
