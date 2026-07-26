export type Range = "1h" | "6h" | "24h" | "7d";

export const RANGE_SECONDS: Record<Range, number> = {
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};
