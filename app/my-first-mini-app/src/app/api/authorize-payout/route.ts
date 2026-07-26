import { NextRequest, NextResponse } from 'next/server';
import { AGENTKIT } from '@worldcoin/agentkit';
import {
  agentkitChallenge,
  resourceUriFor,
  verifyAgentkitRequest,
} from '../../../lib/agentkit';
import { signAuthorization, type PayoutAuthorization } from '../../../lib/authz';
import { Tier } from '../../../lib/access/tiers';
import { CAPABILITY_TIERS } from '../../../lib/access/policy';

export const runtime = 'nodejs';

/**
 * Interface 1 — issue a signed payout authorization for an engagement.
 *
 * The caller is the unit's claim-agent, and it must prove it is human-backed
 * via AgentKit: first call gets a 402 challenge, the retry carries a signed
 * `agentkit` header that we verify and resolve against AgentBook on World
 * Chain (see lib/agentkit.ts). No registered human behind the agent ⇒ 403 —
 * that IS the negative case: same claim from a bare bot script never gets a
 * signature the settle-agent will accept, so no payout.
 *
 * On top of human-backing, the operator's tier must permit payment:release
 * (ELEVATED / Orb+passport) — AgentKit proves "a real unique human stands
 * behind this agent", the tier proves that human is verified enough to be
 * paid from the program treasury.
 *
 * Body: { engagementId, amount?, currency?, nullifier?, tier }
 *  - nullifier: the operator's World ID nullifier; used as the authorization's
 *    humanId when present, else we fall back to the AgentBook human id.
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

  const resourceUri = resourceUriFor(req);

  // 1. AgentKit handshake. Bare request → 402 challenge the client signs over.
  const header = req.headers.get(AGENTKIT);
  if (!header) {
    return NextResponse.json(agentkitChallenge(resourceUri), { status: 402 });
  }

  // 2. Human-backed? Signature must verify AND resolve in AgentBook.
  const agent = await verifyAgentkitRequest(header, resourceUri);
  if (!agent.ok) {
    const status = agent.error === 'not_human_backed' ? 403 : 401;
    return NextResponse.json(
      { authorized: false, error: agent.error, detail: agent.detail },
      { status },
    );
  }

  // 3. Tier permits releasing funds? payment:release requires ELEVATED (Orb+passport).
  const tier = typeof body.tier === 'number' ? body.tier : Tier.UNVERIFIED;
  if (tier < CAPABILITY_TIERS['payment:release']) {
    return NextResponse.json({ authorized: false, error: 'insufficient_tier' }, { status: 403 });
  }

  const now = Math.floor(Date.now() / 1000);
  const authorization: PayoutAuthorization = {
    engagementId: body.engagementId,
    amount: String(body.amount ?? '100'),
    currency: body.currency ?? 'DEFPOINT',
    humanId: body.nullifier ?? agent.humanId,
    tier,
    issuedAt: now,
    expiresAt: now + VALIDITY_SEC,
    nonce: '0x' + crypto.randomUUID().replace(/-/g, ''),
  };

  const signature = await signAuthorization(authorization);
  if (!signature) {
    return NextResponse.json({ error: 'signer_not_configured' }, { status: 500 });
  }

  return NextResponse.json({
    authorized: true,
    authorization,
    signature,
    agent: { address: agent.address, humanId: agent.humanId, backing: agent.backing },
  });
}
