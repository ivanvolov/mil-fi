import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  COOKIE_NAME,
  cookieOptions,
  isWorldVerified,
  lookupSession,
  refreshSession,
  type AuthCollections,
  type Role,
} from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: {
      sessionId: string;
      code: string;
      label: string;
      role: Role;
      worldVerified: boolean;
      worldTier?: number;
    };
  }
}

export function makeRequireSession(c: AuthCollections) {
  return async function requireSession(req: FastifyRequest, reply: FastifyReply) {
    const raw = req.cookies[COOKIE_NAME];
    if (!raw) return reply.status(401).send({ code: 'UNAUTHENTICATED', message: 'no session' });

    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) {
      reply.clearCookie(COOKIE_NAME, cookieOptions());
      return reply.status(401).send({ code: 'UNAUTHENTICATED', message: 'invalid session' });
    }

    const row = await lookupSession(c, unsigned.value);
    if (!row) {
      reply.clearCookie(COOKIE_NAME, cookieOptions());
      return reply.status(401).send({ code: 'UNAUTHENTICATED', message: 'session expired' });
    }

    req.session = {
      sessionId: row._id,
      code: row.code,
      label: row.label,
      role: row.role ?? 'admin',
      worldVerified: isWorldVerified(row),
      worldTier: row.worldTier,
    };
    // sliding window — fire and forget; failure to refresh shouldn't block the request
    refreshSession(c, row._id).catch((err) => req.log.warn({ err }, 'session refresh failed'));
  };
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Coarse role gate for mutations, run AFTER requireSession. Reads are open to every
 *  authenticated role; writes are admin-only, with explicit carve-outs for the flow
 *  actions each role owns (docs/03-architecture-bounty-map.md). Extend the carve-out
 *  list as new flow endpoints land (e.g. POST /settlement/reports for spotters). */
export async function requireRoleForWrite(req: FastifyRequest, reply: FastifyReply) {
  const role = req.session?.role ?? 'admin';
  if (role === 'admin') return;
  if (!WRITE_METHODS.has(req.method)) return;

  const url = req.url.split('?')[0] ?? '';
  const allowed =
    (role === 'military' && req.method === 'POST' && url.startsWith('/api/v1/settlement/engagements')) ||
    (role === 'military' && req.method === 'POST' && url === '/api/v1/settlement/onboard') ||
    (role === 'spotter' && req.method === 'POST' && url === '/api/v1/settlement/spots');
  if (allowed) return;

  return reply.status(403).send({
    code: 'ROLE_FORBIDDEN',
    message: `role '${role}' is not allowed to perform this action`,
  });
}
