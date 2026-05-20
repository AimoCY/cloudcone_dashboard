import type { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { SnapshotSchema, type Snapshot } from "./contract.js";
import type { Db } from "./db.js";

export interface IngestAgent { id: string; token: string; traffic_quota_gb: number; }
export interface IngestDeps {
  db: Db;
  agents: IngestAgent[];
  onSample: (s: Snapshot) => void; // hook for the alert engine
}

function tokenEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// mountIngest registers POST /ingest — Bearer-token auth, schema validation, store.
export function mountIngest(app: Hono, deps: IngestDeps): void {
  app.post("/ingest", async (c) => {
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const agent = deps.agents.find((a) => tokenEq(a.token, token));
    if (!token || !agent) return c.json({ error: "unauthorized" }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const parsed = SnapshotSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid payload", detail: parsed.error.issues }, 400);
    }
    if (parsed.data.vps_id !== agent.id) {
      return c.json({ error: "token does not match vps_id" }, 403);
    }

    deps.db.insertSnapshot(parsed.data);
    deps.onSample(parsed.data);
    return c.json({ ok: true });
  });
}
