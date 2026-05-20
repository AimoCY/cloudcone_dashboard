import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { mountAuth, requireSession } from "./auth.js";

function app() {
  const hash = bcrypt.hashSync("correct-horse", 10);
  const a = new Hono();
  mountAuth(a, { passwordHash: hash, sessionSecret: "secret-secret-secret-secret" });
  a.get("/api/secret", requireSession("secret-secret-secret-secret"), (c) => c.text("ok"));
  return a;
}

describe("auth", () => {
  it("rejects /api with no session cookie", async () => {
    const res = await app().request("/api/secret");
    expect(res.status).toBe(401);
  });

  it("logs in with the correct password and then allows /api", async () => {
    const a = app();
    const login = await a.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct-horse" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session=");
    const res = await a.request("/api/secret", { headers: { cookie: cookie.split(";")[0] } });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    const login = await app().request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(login.status).toBe(401);
  });

  it("rejects a forged/garbage session cookie", async () => {
    const res = await app().request("/api/secret", { headers: { cookie: "session=forged" } });
    expect(res.status).toBe(401);
  });
});
