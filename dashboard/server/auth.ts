import type { Hono, Context, Next } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import bcrypt from "bcryptjs";

export interface AuthConfig { passwordHash: string; sessionSecret: string; }

const COOKIE = "session";
const SESSION_VALUE = "authenticated";

// mountAuth registers POST /login and POST /logout on the app.
export function mountAuth(app: Hono, cfg: AuthConfig): void {
  app.post("/login", async (c) => {
    let password = "";
    try {
      password = (await c.req.json<{ password?: string }>()).password ?? "";
    } catch {
      return c.json({ error: "bad request" }, 400);
    }
    if (!bcrypt.compareSync(password, cfg.passwordHash)) {
      return c.json({ error: "invalid password" }, 401);
    }
    await setSignedCookie(c, COOKIE, SESSION_VALUE, cfg.sessionSecret, {
      httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 7,
    });
    return c.json({ ok: true });
  });

  app.post("/logout", (c) => {
    c.header("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly`);
    return c.json({ ok: true });
  });
}

// requireSession is middleware that 401s requests without a valid session.
export function requireSession(sessionSecret: string) {
  return async (c: Context, next: Next) => {
    const v = await getSignedCookie(c, sessionSecret, COOKIE);
    if (v !== SESSION_VALUE) return c.json({ error: "unauthorized" }, 401);
    await next();
  };
}
