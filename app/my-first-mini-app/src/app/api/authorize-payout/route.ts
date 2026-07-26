import { NextRequest, NextResponse } from 'next/server';
import { signAuthorization, type PayoutAuthorization } from '../../../lib/authz';
import { Tier } from '../../../lib/access/tiers';
import { CAPABILITY_TIERS } from '../../../lib/access/policy';

export const runtime = 'nodejs';

/**
 * Interface 1 — issue a signed payout authorization for an engagement.
 *
 * The platform's settle-agent presents this signature before releasing DEFPOINT.
 * We only sign for a human-backed operator whose tier permits payment:release
 * (ELEVATED / Orb). A bot (no nullifier) or an under-verified operator is refused
 * here — which is exactly the demo's negative case: no signature ⇒ no payout.
 *
 * Body: { engagementId, amount?, currency?, nullifier, tier }
 *  - nullifier: the operator's World ID nullifier (proof a real human is behind it)
 *  - tier: their verification tier (from World ID; see lib/access/tiers.ts)
 */
const VALIDITY_SEC = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    engagementId?: string;
    amount?: string | number;
    currency?: string;
    nullifier?: string;
    tier?: number;
  } | null;

  if (!body?.engagementId) {
    return NextResponse.json({ authorized: false, error: 'invalid_request' }, { status: 400 });
  }

  // 1. Human-backed? No nullifier ⇒ it's a bot. (Real deployment: AgentBook lookup.)
  if (!body.nullifier) {
    return NextResponse.json({ authorized: false, error: 'not_human_backed' }, { status: 403 });
  }

  // 2. Tier permits releasing funds? payment:release requires ELEVATED (Orb+passport).
  const tier = typeof body.tier === 'number' ? body.tier : Tier.UNVERIFIED;
  if (tier < CAPABILITY_TIERS['payment:release']) {
    return NextResponse.json({ authorized: false, error: 'insufficient_tier' }, { status: 403 });
  }

  const now = Math.floor(Date.now() / 1000);
  const authorization: PayoutAuthorization = {
    engagementId: body.engagementId,
    amount: String(body.amount ?? '100'),
    currency: body.currency ?? 'DEFPOINT',
    humanId: body.nullifier,
    tier,
    issuedAt: now,
    expiresAt: now + VALIDITY_SEC,
    nonce: '0x' + crypto.randomUUID().replace(/-/g, ''),
  };

  const signature = await signAuthorization(authorization);
  if (!signature) {
    return NextResponse.json({ error: 'signer_not_configured' }, { status: 500 });
  }

  return NextResponse.json({ authorized: true, authorization, signature });
}
