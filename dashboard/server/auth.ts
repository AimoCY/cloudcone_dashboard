import type { Hono, Context, Next } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db, UserRow } from "./db.js";
import { hashSecret } from "./secrets.js";

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export interface AuthConfig {
  db: Db;
  sessionSecret: string;
}

declare module "hono" {
  interface ContextVariableMap {
    authUser: AuthUser;
  }
}

const COOKIE = "session";
const LEGACY_SESSION_VALUE = "authenticated";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-user-password", 10);
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}_.-]{2,31}$/u;

function publicUser(user: UserRow): AuthUser {
  return { id: user.id, username: user.username, role: user.role };
}

function sessionUser(value: string | undefined, cfg: AuthConfig): UserRow | undefined {
  if (!value) return undefined;
  // Cookies created by the previous single-user release remain valid and map
  // to the bootstrapped administrator during an upgrade.
  if (value === LEGACY_SESSION_VALUE) return cfg.db.getFirstAdmin();
  return cfg.db.getUserById(value);
}

async function setSession(c: Context, user: UserRow, cfg: AuthConfig): Promise<void> {
  await setSignedCookie(c, COOKIE, user.id, cfg.sessionSecret, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.req.header("X-Forwarded-Proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

// mountAuth registers login, logout, and invitation-only self-registration.
export function mountAuth(app: Hono, cfg: AuthConfig): void {
  app.post("/login", async (c) => {
    let username = "";
    let password = "";
    try {
      const body = await c.req.json<{ username?: string; password?: string }>();
      username = body.username?.trim() ?? "";
      password = body.password ?? "";
    } catch {
      return c.json({ error: "bad request" }, 400);
    }

    const fallback = cfg.db.getFirstAdmin();
    // Missing username preserves compatibility with the previous admin-only
    // API client. New clients always send a username.
    const user = username ? cfg.db.getUserByUsername(username) : fallback;
    const valid = await bcrypt.compare(
      password,
      user?.password_hash ?? fallback?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) return c.json({ error: "invalid credentials" }, 401);

    await setSession(c, user, cfg);
    return c.json(publicUser(user));
  });

  app.post("/register", async (c) => {
    let username = "";
    let password = "";
    let inviteCode = "";
    try {
      const body = await c.req.json<{ username?: string; password?: string; invite_code?: string }>();
      username = body.username?.trim() ?? "";
      password = body.password ?? "";
      inviteCode = body.invite_code?.trim().toUpperCase() ?? "";
    } catch {
      return c.json({ error: "bad request" }, 400);
    }

    if (!USERNAME_RE.test(username)) {
      return c.json({ error: "invalid username", detail: "用户名需为 3-32 位文字、数字、点、下划线或短横线" }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return c.json({ error: "invalid password", detail: "密码长度需为 8-128 位" }, 400);
    }
    if (!inviteCode) return c.json({ error: "invalid invite" }, 400);

    const now = Math.floor(Date.now() / 1000);
    const inviteCodeHash = hashSecret(inviteCode);
    // Reject random/expired codes before doing the intentionally expensive
    // password hash. The transaction below checks the invite again so two
    // concurrent registrations still cannot consume it twice.
    if (!cfg.db.hasUsableInvite(inviteCodeHash, now)) {
      return c.json({ error: "invalid or expired invite" }, 400);
    }

    const id = randomUUID();
    const result = cfg.db.registerUserWithInvite({
      id,
      username,
      password_hash: await bcrypt.hash(password, 10),
      invite_code_hash: inviteCodeHash,
      now,
    });
    if (result === "username_taken") return c.json({ error: "username taken" }, 409);
    if (result !== "ok") return c.json({ error: "invalid or expired invite" }, 400);

    const user = cfg.db.getUserById(id)!;
    await setSession(c, user, cfg);
    return c.json(publicUser(user), 201);
  });

  app.post("/logout", (c) => {
    const secure = c.req.header("X-Forwarded-Proto") === "https" ? "; Secure" : "";
    c.header("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    return c.json({ ok: true });
  });
}

export function requireSession(cfg: AuthConfig) {
  return async (c: Context, next: Next) => {
    const value = await getSignedCookie(c, cfg.sessionSecret, COOKIE);
    const user = sessionUser(typeof value === "string" ? value : undefined, cfg);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("authUser", publicUser(user));
    await next();
  };
}
