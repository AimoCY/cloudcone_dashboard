import { createHash, randomBytes } from "node:crypto";

// Agent tokens and invitation codes are high-entropy bearer secrets. Store a
// deterministic SHA-256 digest so the plaintext is only visible at creation.
export function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createAgentToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createInviteCode(): string {
  // Grouped for easier copy/paste while retaining 144 bits of entropy.
  const raw = randomBytes(18).toString("base64url").toUpperCase();
  return raw.match(/.{1,6}/g)!.join("-");
}
