import { NextRequest, NextResponse } from 'next/server';
import { Tier, TIER_LABELS } from '../../../../lib/access/tiers';
import { CAPABILITY_TIERS, type Capability } from '../../../../lib/access/policy';

export const runtime = 'nodejs';

/**
 * Interface 2 — what a World-verified person (by nullifier) is cleared to do.
 * The platform reads this to gate the web dashboard by real World tier.
 *
 * Demo: the persisted verification store isn't wired yet, so the tier is taken
 * from `?tier=` (0..3) — letting the platform be exercised end to end before the
 * full IDKit persistence lands. Unknown nullifier defaults to Tier 0.
 * We never return nationality — only the boolean-derived tier + capabilities.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ nullifier: string }> },
) {
  const { nullifier } = await ctx.params;
  const raw = Number(new URL(req.url).searchParams.get('tier'));
  const tier = Number.isFinite(raw) && raw >= 0 && raw <= 3 ? raw : Tier.UNVERIFIED;

  const capabilities = Object.fromEntries(
    (Object.keys(CAPABILITY_TIERS) as Capability[]).map((c) => [c, tier >= CAPABILITY_TIERS[c]]),
  );

  return NextResponse.json({
    nullifier,
    tier,
    tierLabel: TIER_LABELS[tier as Tier] ?? 'Unverified',
    capabilities,
  });
}
