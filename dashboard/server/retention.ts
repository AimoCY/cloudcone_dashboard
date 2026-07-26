import type { Db } from "./db.js";

// runRetention deletes samples older than retentionDays. Returns rows removed.
// `now` is injectable for testing; production passes Date.now()/1000.
export function runRetention(db: Db, retentionDays: number, now: number): number {
  const cutoff = now - retentionDays * 86_400;
  return db.deleteOlderThan(cutoff);
}
