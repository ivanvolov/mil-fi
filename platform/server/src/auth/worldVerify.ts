import { signRequest } from '@worldcoin/idkit/signing';
import type { FastifyInstance } from 'fastify';
import { config, worldIdVerifyEnabled } from '../config.js';
import { markWorldVerified, type AuthCollections, type WorldCredentialType } from './session.js';

/**
 * One-time World ID identity confirmation. Not a login step — the operator is already
 * signed in via username/password (auth/routes.ts). This proves which clearance level
 * a *verified* session actually holds, once, and the result is persisted forever
 * (see markWorldVerified). Ported from the proven flow in
 * app/my-first-mini-app/src/app/api/{rp-signature,console-verify}/route.ts, which
 * already round-trips end-to-end against World's v4 verify API.
 *
 * Reuses the same World Developer Portal app/action as the mini app — provisioning a
 * second Relying Party isn't worth the time under deadline pressure.
 */
const WORLD_ACTION = 'test-action';

type WorldVerifyV4Response = {
  success: boolean;
  nullifier?: string;
  results?: Array<{ identifier?: string; success?: boolean; nullifier?: string }>;
  message?: string;
};

/** Ascending order matches app/my-first-mini-app/src/lib/access/tiers.ts's Tier enum. */
const TIER_LABELS = ['Unverified', 'Basic', 'Verified', 'Elevated'] as const;

function tierForIdentifier(identifier: string | undefined): number {
  switch (identifier) {
    case 'proof_of_human':
    case 'orb':
      return 3; // ELEVATED — government
    case 'passport':
      return 2; // VERIFIED — military
    case 'selfie':
      return 1; // BASIC — spotter
    default:
      return 0; // UNVERIFIED
  }
}

export async function registerWorldVerifyRoutes(app: FastifyInstance, c: AuthCollections) {
  app.post('/rp-signature', async (req, reply) => {
    if (!req.session) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    if (!worldIdVerifyEnabled) {
      return reply.status(500).send({ error: 'World ID verification is not configured (RP_SIGNING_KEY/RP_ID)' });
    }

    const sig = signRequest({ action: WORLD_ACTION, signingKeyHex: config.world.rpSigningKey });
    return {
      rp_id: config.world.rpId,
      sig: sig.sig,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
    };
  });

  app.post('/verify', async (req, reply) => {
    if (!req.session) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    if (!worldIdVerifyEnabled) {
      return reply.status(500).send({ error: 'World ID verification is not configured (RP_SIGNING_KEY/RP_ID)' });
    }
    if (req.session.role === 'admin') {
      return reply.status(400).send({ error: 'admin does not need World ID verification' });
    }
    if (req.session.worldVerified) {
      return reply.status(409).send({ error: 'already verified' });
    }

    const body = req.body as { idkitResponse?: unknown } | null;
    if (!body?.idkitResponse) {
      return reply.status(400).send({ error: 'idkitResponse is required' });
    }

    const upstream = await fetch(
      `https://developer.world.org/api/v4/verify/${encodeURIComponent(config.world.rpId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body.idkitResponse),
      },
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      return reply.status(400).send({ error: 'Verification failed', detail });
    }

    const result = (await upstream.json()) as WorldVerifyV4Response;
    const passed = result.results?.find((r) => r.success) ?? result.results?.[0];
    const nullifier = passed?.nullifier ?? result.nullifier ?? 'unknown';
    const tier = tierForIdentifier(passed?.identifier);
    const credentialType = (passed?.identifier ?? 'unknown') as WorldCredentialType;

    await markWorldVerified(c, req.session.code, req.session.sessionId, {
      nullifier,
      tier,
      credentialType,
    });

    return {
      label: req.session.label,
      role: req.session.role,
      worldVerified: true,
      tier,
      tierLabel: TIER_LABELS[tier],
    };
  });
}
