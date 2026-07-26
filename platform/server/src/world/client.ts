import { config, worldClientEnabled } from '../config.js';
import type { PayoutAuthorization } from './auth.js';

/**
 * Outbound calls to the World mini-app service (docs/04-integration-contract.md).
 * Both degrade gracefully: with no WORLD_BASE_URL/WORLD_SERVICE_TOKEN configured
 * they no-op, so the pipeline runs standalone in demo mode.
 */

export interface EngagementVerdict {
  engagementId: string;
  threatConfirmed: boolean;
  killConfirmed: boolean;
  operatorNullifier?: string;
  evidenceHashes: string[];
}

export interface WorldCallResult {
  ok: boolean;
  status?: number;
  skippedReason?: string;
}

/**
 * Interface 3 — tell World the engagement's verdict. When both flags are true,
 * the operator's agent becomes allowed to pull a payout authorization on its own
 * (the "autonomous" half of the AgentKit requirement). We only report; World
 * doesn't re-judge, and imagery never leaves our side.
 */
export async function postEngagementVerdict(v: EngagementVerdict): Promise<WorldCallResult> {
  if (!worldClientEnabled) return { ok: false, skippedReason: 'world-client-disabled' };
  try {
    const res = await fetch(`${config.world.baseUrl}/api/engagement-verdict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.world.serviceToken}`,
      },
      body: JSON.stringify(v),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, skippedReason: err instanceof Error ? err.message : 'verdict-post-failed' };
  }
}

export interface PulledAuthorization {
  authorization: PayoutAuthorization;
  signature: string;
}

/**
 * Interface 1 (pull side) — ask World to sign a payout authorization for an
 * engagement, given the operator's World identity. Returns null when World
 * refuses (bot / insufficient tier / not configured) — the settle-agent then has
 * no authorization and rejects the payout. This is the wired-up negative case.
 */
export async function getPayoutAuthorization(input: {
  engagementId: string;
  nullifier: string;
  tier: number;
  amount?: string;
  currency?: string;
}): Promise<PulledAuthorization | null> {
  if (!worldClientEnabled) return null;
  try {
    const res = await fetch(`${config.world.baseUrl}/api/authorize-payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.world.serviceToken}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null; // 403 not_human_backed / insufficient_tier
    const body = (await res.json()) as { authorized?: boolean } & PulledAuthorization;
    return body.authorized ? { authorization: body.authorization, signature: body.signature } : null;
  } catch {
    return null;
  }
}

export interface WorldCredentials {
  nullifier: string;
  tier: number;
  tierLabel?: string;
  capabilities?: Record<string, boolean>;
}

/**
 * Interface 2 — look up what a World-verified person (by nullifier) is cleared
 * to do. Used to gate the web platform by real World tier rather than only the
 * invite-code role. 404 from World means Tier 0 (not an error).
 */
export async function getWorldCredentials(nullifier: string): Promise<WorldCredentials | null> {
  if (!worldClientEnabled) return null;
  try {
    const res = await fetch(
      `${config.world.baseUrl}/api/credentials/${encodeURIComponent(nullifier)}`,
      { headers: { Authorization: `Bearer ${config.world.serviceToken}` } },
    );
    if (res.status === 404) return { nullifier, tier: 0 };
    if (!res.ok) return null;
    return (await res.json()) as WorldCredentials;
  } catch {
    return null;
  }
}
