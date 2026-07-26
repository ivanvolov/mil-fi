import {
  AGENTKIT,
  buildAgentkitSchema,
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';
import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Server side of the AgentKit handshake (docs.world.org/agents/agent-kit).
 *
 * Protocol: an agent's first request arrives bare → we answer 402 with a
 * challenge (nonce + resource info). The AgentKit client signs a SIWE message
 * over that challenge with the agent's wallet key and retries with an
 * `agentkit` header. We verify the signature, then resolve the wallet in
 * AgentBook (the registry contract on World Chain) to the anonymous id of the
 * human who approved the agent's registration in World App. Null ⇒ nobody
 * stands behind this agent ⇒ the caller is a bot, not a human-backed agent.
 */

/** CAIP-2 chain the agent signs on. World Chain mainnet — AgentBook lives there
 * anyway, so one chain (and one RPC) covers both signature and registry. */
const CHAIN_ID = process.env.AGENTKIT_CHAIN_ID ?? 'eip155:480';

/** Optional RPC override for both signature verification and the AgentBook
 * read. Default is the chain's public RPC via viem. */
const RPC_URL = process.env.AGENTKIT_RPC_URL || undefined;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Nonces we issued in 402 challenges, awaiting their signed retry. Single-use:
 * consumed on verification, so a captured header cannot be replayed. In-memory
 * is a documented demo limitation — one server process, lost on restart (the
 * client just gets a fresh 402 and re-signs).
 */
const issuedNonces = new Map<string, number>();

function pruneNonces(now: number): void {
  for (const [nonce, expiresAt] of issuedNonces) {
    if (expiresAt <= now) issuedNonces.delete(nonce);
  }
}

/**
 * The resource URI both sides sign over. Must be identical in the challenge we
 * issue and the validation of the signed retry, and its host must be the host
 * the agent believes it is talking to. Behind the cloudflared tunnel the
 * request URL is localhost, so a configured public base (AUTH_URL) wins.
 */
export function resourceUriFor(req: NextRequest): string {
  const explicit = process.env.AGENTKIT_RESOURCE_URI;
  if (explicit) return explicit;
  const base = process.env.AUTH_URL;
  const path = req.nextUrl.pathname;
  if (base) return new URL(path, base).toString();
  return new URL(path, req.nextUrl.origin).toString();
}

/**
 * Body for the 402 response. Shape follows the x402 payment-required envelope;
 * the AgentKit client only reads `extensions.agentkit`.
 */
export function agentkitChallenge(resourceUri: string): Record<string, unknown> {
  const now = Date.now();
  pruneNonces(now);
  const nonce = randomBytes(16).toString('hex');
  issuedNonces.set(nonce, now + CHALLENGE_TTL_MS);
  return {
    x402Version: 2,
    error: 'agentkit_signature_required',
    accepts: [],
    extensions: {
      [AGENTKIT]: {
        info: {
          domain: new URL(resourceUri).hostname,
          uri: resourceUri,
          statement: 'MilFi payout claim: prove this agent acts for a real, unique human.',
          version: '1',
          nonce,
          issuedAt: new Date(now).toISOString(),
          resources: [resourceUri],
        },
        supportedChains: [{ chainId: CHAIN_ID, type: 'eip191' }],
        schema: buildAgentkitSchema(),
      },
    },
  };
}

export type AgentVerification =
  | { ok: true; address: string; humanId: string; backing: 'agentbook' | 'dev-stub' }
  | { ok: false; error: 'invalid_agentkit_header' | 'invalid_agentkit_message' | 'invalid_agentkit_signature' | 'not_human_backed'; detail?: string };

/**
 * Verify a signed `agentkit` header end-to-end: parse → validate (domain/uri/
 * age/nonce) → verify signature on-chain → resolve human backing in AgentBook.
 *
 * AGENTKIT_DEV_BACKED_ADDRESSES (comma-separated) lets us rehearse the happy
 * path before the one-time World App registration tap has happened: listed
 * addresses that AgentBook doesn't know get a stub human id, clearly labelled
 * `dev-stub` so a demo can never pass it off as the real thing.
 */
export async function verifyAgentkitRequest(
  header: string,
  resourceUri: string,
): Promise<AgentVerification> {
  let payload;
  try {
    payload = parseAgentkitHeader(header);
  } catch (err) {
    return {
      ok: false,
      error: 'invalid_agentkit_header',
      detail: err instanceof Error ? err.message : undefined,
    };
  }

  const validation = await validateAgentkitMessage(payload, resourceUri, {
    checkNonce: (nonce) => {
      const expiresAt = issuedNonces.get(nonce);
      if (expiresAt === undefined || expiresAt <= Date.now()) return false;
      issuedNonces.delete(nonce); // single-use
      return true;
    },
  });
  if (!validation.valid) {
    return { ok: false, error: 'invalid_agentkit_message', detail: validation.error };
  }

  const verification = await verifyAgentkitSignature(payload, RPC_URL);
  if (!verification.valid || !verification.address) {
    return { ok: false, error: 'invalid_agentkit_signature', detail: verification.error };
  }
  const address = verification.address;

  const agentBook = createAgentBookVerifier({ rpcUrl: RPC_URL });
  const humanId = await agentBook.lookupHuman(address);
  if (humanId) return { ok: true, address, humanId, backing: 'agentbook' };

  const devBacked = (process.env.AGENTKIT_DEV_BACKED_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (devBacked.includes(address.toLowerCase())) {
    return { ok: true, address, humanId: `dev-stub:${address.toLowerCase()}`, backing: 'dev-stub' };
  }

  return { ok: false, error: 'not_human_backed' };
}
