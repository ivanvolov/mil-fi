import {
  AGENTKIT,
  buildAgentkitSchema,
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
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
 * Challenge nonces are STATELESS: `expiresAtMs.random.hmac(expiresAtMs.random)`.
 * Any instance can verify a nonce it didn't issue — required on serverless
 * (Vercel), where the 402 challenge and the signed retry routinely land on
 * different lambdas and an in-memory issued-set would reject every retry.
 * Replay defence: nonces expire with the challenge TTL, and each instance
 * additionally remembers nonces it has already accepted (best-effort dedup;
 * cross-instance replay within the TTL is a documented demo limitation).
 */
const nonceSecret =
  process.env.HMAC_SECRET_KEY || process.env.AUTH_SECRET || randomBytes(32).toString('hex');

const usedNonces = new Map<string, number>();

function nonceMac(body: string): string {
  return createHmac('sha256', nonceSecret).update(body).digest('hex').slice(0, 32);
}

/** Nonce layout (hex only — SIWE requires alphanumeric nonces): 12-char hex
 * expiry (epoch ms) + 24-char hex random + 32-char hex HMAC. */
function issueNonce(now: number): string {
  const body =
    (now + CHALLENGE_TTL_MS).toString(16).padStart(12, '0') + randomBytes(12).toString('hex');
  return body + nonceMac(body);
}

function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [used, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(used);
  }
  if (nonce.length !== 68) return false;
  const body = nonce.slice(0, 36);
  const mac = nonce.slice(36);
  const expiresAt = parseInt(body.slice(0, 12), 16);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = nonceMac(body);
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  if (usedNonces.has(nonce)) return false; // per-instance replay guard
  usedNonces.set(nonce, expiresAt);
  return true;
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
  const nonce = issueNonce(now);
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
    checkNonce: consumeNonce,
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
