import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Local verification/.env wins, repo-root .env is the fallback.
for (const p of [resolve(here, "../.env"), resolve(here, "../../.env")]) {
  if (existsSync(p)) loadEnv({ path: p });
}

export const BASE_URL = (
  process.env.ZG_ROUTER_BASE_URL ??
  "https://router-api-testnet.integratenetwork.work/v1"
).replace(/\/$/, "");

export const API_KEY = process.env.ZG_ROUTER_API_KEY ?? "";
export const MODEL = process.env.ZG_MODEL ?? "";

export function requireKey(): string {
  if (!API_KEY) {
    console.error(
      "ZG_ROUTER_API_KEY is not set.\n" +
        "Create one at https://pc.testnet.0g.ai (dashboard → API keys) " +
        "and add it to verification/.env or the repo-root .env."
    );
    process.exit(1);
  }
  return API_KEY;
}

export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireKey()}`,
    "Content-Type": "application/json",
  };
}
