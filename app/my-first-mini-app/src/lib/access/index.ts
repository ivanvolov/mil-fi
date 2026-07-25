/**
 * Access control for MilFi.
 *
 * One rule, no exceptions: features ask `can()` / `requireCapability()`. Nothing
 * anywhere else compares tiers inline. That is what makes the locks in
 * `policy.ts` a single switch rather than a hunt through the codebase.
 *
 * @example Server route
 * export const POST = withErrorHandler(
 *   requireCapability('report:submit', async (request) => {
 *     // ... only reachable by a viewer holding the required tier
 *   })
 * );
 *
 * @example UI
 * const decision = explain(credentials, 'tasking:confirm');
 * if (!decision.allowed) return <LockedPanel decision={decision} />;
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  ANONYMOUS,
  Credentials,
  isNationalityDenied,
  selfieHasExpired,
  Tier,
  TIER_REQUIREMENTS,
  tierFor,
} from './tiers';
import { CAPABILITY_TIERS, Capability, requiredTier } from './policy';

export * from './tiers';
export * from './policy';

/** Why a capability was refused. Drives which UI the user is shown. */
export type DenialReason =
  /** Viewer simply hasn't climbed high enough yet — offer the next step. */
  | 'insufficient-tier'
  /** Passport verified, nationality outside the allow-list. Terminal; no retry. */
  | 'nationality-denied'
  /** Held a Selfie Check that aged out — a re-check restores access. */
  | 'selfie-expired';

export interface AccessDecision {
  allowed: boolean;
  currentTier: Tier;
  /** What is enforced right now (Tier.UNVERIFIED while enforcement is off). */
  requiredTier: Tier;
  /** What this capability will demand once enforcement is on. */
  eventualTier: Tier;
  reason?: DenialReason;
  /** Human-readable next step, or null when there isn't one. */
  remedy: string | null;
}

/** Straight yes/no. Use `explain()` when the UI needs to say why. */
export function can(
  credentials: Credentials,
  capability: Capability,
  now: number = Date.now(),
): boolean {
  return tierFor(credentials, now) >= requiredTier(capability);
}

/**
 * Full decision, including why a refusal happened and what the user can do next.
 *
 * Note `eventualTier` is reported even while enforcement is off, so the UI can
 * honestly preview what a feature will require without pretending it's locked.
 */
export function explain(
  credentials: Credentials,
  capability: Capability,
  now: number = Date.now(),
): AccessDecision {
  const currentTier = tierFor(credentials, now);
  const required = requiredTier(capability);
  const eventualTier = CAPABILITY_TIERS[capability];

  if (currentTier >= required) {
    return { allowed: true, currentTier, requiredTier: required, eventualTier, remedy: null };
  }

  // Order matters: a denied nationality is terminal, so it must be reported
  // ahead of the generic "verify further" path. Telling a blocked user to try
  // again would be both useless and misleading.
  if (isNationalityDenied(credentials)) {
    return {
      allowed: false,
      currentTier,
      requiredTier: required,
      eventualTier,
      reason: 'nationality-denied',
      remedy: null,
    };
  }

  if (selfieHasExpired(credentials, now)) {
    return {
      allowed: false,
      currentTier,
      requiredTier: required,
      eventualTier,
      reason: 'selfie-expired',
      remedy: 'Your Selfie Check has expired. Complete a new one to continue.',
    };
  }

  return {
    allowed: false,
    currentTier,
    requiredTier: required,
    eventualTier,
    reason: 'insufficient-tier',
    remedy: TIER_REQUIREMENTS[required],
  };
}

/**
 * Resolve the caller's credentials.
 *
 * TODO(auth): returns ANONYMOUS until login is rebuilt on IDKit. The current
 * session is wallet-based via MiniKit, which does not exist on the web surface
 * we are shipping, so there is nothing truthful to read yet. Deliberately a stub
 * rather than a fake: with enforcement ON this denies everything, which is the
 * correct failure direction. Wire this to the IDKit session and it is the only
 * place that needs to change.
 */
export async function resolveCredentials(
  _request: NextRequest,
): Promise<Credentials> {
  return ANONYMOUS;
}

type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

/**
 * Route guard. Compose inside `withErrorHandler` so refusals are still logged
 * and shaped like every other error response.
 *
 * Server-side enforcement is the real control — hiding a button in the UI is a
 * courtesy, not a boundary.
 */
export function requireCapability(
  capability: Capability,
  handler: RouteHandler,
): RouteHandler {
  return async (request, context) => {
    const credentials = await resolveCredentials(request);
    const decision = explain(credentials, capability);

    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: 'Insufficient verification',
          capability,
          reason: decision.reason,
          remedy: decision.remedy,
        },
        { status: 403 },
      );
    }

    return handler(request, context);
  };
}
