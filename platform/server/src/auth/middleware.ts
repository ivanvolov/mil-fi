import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  COOKIE_NAME,
  cookieOptions,
  lookupSession,
  refreshSession,
  type AuthCollections,
} from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: { code: string; label: string };
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

    req.session = { code: row.code, label: row.label };
    // sliding window — fire and forget; failure to refresh shouldn't block the request
    refreshSession(c, row._id).catch((err) => req.log.warn({ err }, 'session refresh failed'));
  };
}
