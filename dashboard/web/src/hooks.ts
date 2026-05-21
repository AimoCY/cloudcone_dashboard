import { useEffect, useState } from "react";
import { api } from "./api.js";
import type { OverviewRow } from "./types.js";

// Polls /api/overview every 10s. Shared by Fleet / Detail / Alerts.
export function useOverview(): { rows: OverviewRow[]; error: string; loaded: boolean } {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      api.overview()
        .then((r) => {
          if (!alive) return;
          setRows(r);
          setError("");
          setLoaded(true);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { rows, error, loaded };
}
