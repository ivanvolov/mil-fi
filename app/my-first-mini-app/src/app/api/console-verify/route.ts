import { NextRequest, NextResponse } from 'next/server';
import { Tier, TIER_LABELS } from '../../../lib/access/tiers';
import { CAPABILITY_TIERS, type Capability } from '../../../lib/access/policy';

export const runtime = 'nodejs';

/**
 * Verifies the proof the Console page collected (browser + phone QR/simulator
 * flow) against World's v4 verify API, then maps the credential that was
 * actually presented to a demo tier + capability set.
 *
 * Simplification, stated plainly: World's v4 response tells us which ONE
 * credential satisfied this single verification action (results[].identifier).
 * The real business rule (tiers.ts) requires passport + orb together for
 * ELEVATED, which needs persisting credentials per-nullifier across sessions —
 * out of scope for the hackathon demo. Here, whichever single credential
 * succeeded maps directly to its own tier: selfie→BASIC, passport→VERIFIED,
 * proof_of_human (Orb)→ELEVATED. Good enough to demo each clearance level.
 */

const RP_ID = process.env.RP_ID;

type VerifyV4Response = {
  success: boolean;
  nullifier?: string;
  results?: Array<{ identifier?: string; success?: boolean; nullifier?: string }>;
  message?: string;
};

function tierForIdentifier(identifier: string | undefined): Tier {
  switch (identifier) {
    case 'proof_of_human':
    case 'orb':
      return Tier.ELEVATED;
    case 'passport':
      return Tier.VERIFIED;
    case 'selfie':
      return Tier.BASIC;
    default:
      return Tier.UNVERIFIED;
  }
}

export async function POST(req: NextRequest) {
  if (!RP_ID) {
    return NextResponse.json({ error: 'RP_ID not configured' }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { idkitResponse?: unknown } | null;
  if (!body?.idkitResponse) {
    return NextResponse.json({ error: 'idkitResponse is required' }, { status: 400 });
  }

  const upstream = await fetch(
    `https://developer.world.org/api/v4/verify/${encodeURIComponent(RP_ID)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.idkitResponse),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json({ error: 'Verification failed', detail }, { status: 400 });
  }

  const result = (await upstream.json()) as VerifyV4Response;
  const passed = result.results?.find((r) => r.success) ?? result.results?.[0];
  const nullifier = passed?.nullifier ?? result.nullifier ?? 'unknown';
  const tier = tierForIdentifier(passed?.identifier);

  const capabilities = Object.fromEntries(
    (Object.keys(CAPABILITY_TIERS) as Capability[]).map((c) => [c, tier >= CAPABILITY_TIERS[c]]),
  );

  return NextResponse.json({
    nullifier,
    credentialType: passed?.identifier ?? 'unknown',
    tier,
    tierLabel: TIER_LABELS[tier],
    capabilities,
  });
}
