import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Repo root (this file lives in apps/signal/src or apps/signal/dist). */
export const REPO_ROOT = resolve(import.meta.dirname, "../../..");

// Load the shared root .env if it exists. Real environment variables win,
// which is what we want in production.
try {
  process.loadEnvFile(resolve(REPO_ROOT, ".env"));
} catch {
  // No .env file: fine, everything has a default.
}

const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.SIGNAL_PORT ?? 4000),
  /** Empty = allow any origin (local dev / LAN testing). */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** `--https` flag: serve over HTTPS with the dev certificate from scripts/gen-cert.mjs. */
  https: process.argv.includes("--https"),
  turn: {
    meteredAppName: process.env.METERED_APP_NAME?.trim() || null,
    meteredApiKey: process.env.METERED_API_KEY?.trim() || null,
    urls: list(process.env.TURN_URLS),
    username: process.env.TURN_USERNAME?.trim() || null,
    credential: process.env.TURN_CREDENTIAL?.trim() || null,
  },
  room: {
    capacity: 2,
    /** How long someone whose connection dropped keeps their place in the room. */
    graceMs: 30_000,
  },
};

export function loadDevCertificate(): { key: Buffer; cert: Buffer } {
  try {
    return {
      key: readFileSync(resolve(REPO_ROOT, "certs/dev-key.pem")),
      cert: readFileSync(resolve(REPO_ROOT, "certs/dev-cert.pem")),
    };
  } catch {
    throw new Error("Dev certificate not found. Run `node scripts/gen-cert.mjs` from the repo root first.");
  }
}
