import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../lib/crud.js';
import {
  COOKIE_NAME,
  cookieOptions,
  createSession,
  destroySession,
  isWorldVerified,
  normalizeCode,
  hashPassword,
  lookupSession,
  type AuthCollections,
} from './session.js';

// Login accepts EITHER a numeric invite code, OR a username + password
// (the demo role accounts seeded by `npm run seed:users`).
const loginBody = z.object({
  code: z.string().min(1).max(64).optional(),
  username: z.string().min(1).max(64).optional(),
  password: z.string().min(1).max(128).optional(),
});

export async function registerAuthRoutes(app: FastifyInstance, c: AuthCollections) {
  // Login is the only route we rate-limit. Using fastify-rate-limit's per-route config.
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (req, reply) => {
      const { code, username, password } = loginBody.parse(req.body);

      let invite = null;
      if (username && password) {
        // Username/password path (demo role accounts).
        const found = await c.invites.findOne({ username });
        if (found && !found.revoked && found.passwordHash === hashPassword(password)) {
          invite = found;
        }
        if (!invite) throw new HttpError(401, 'INVALID_LOGIN', 'invalid username or password');
      } else {
        // Numeric invite-code path (back-compat).
        const normalized = normalizeCode(code);
        if (!normalized) throw new HttpError(401, 'INVALID_CODE', 'invalid code');
        const found = await c.invites.findOne({ _id: normalized });
        if (!found || found.revoked) throw new HttpError(401, 'INVALID_CODE', 'invalid code');
        invite = found;
      }

      const session = await createSession(c, invite);
      reply.setCookie(COOKIE_NAME, session._id, cookieOptions());
      return {
        ok: true,
        label: invite.label,
        role: session.role ?? 'admin',
        worldVerified: isWorldVerified(session),
        worldTier: session.worldTier ?? null,
      };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    const raw = req.cookies[COOKIE_NAME];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await destroySession(c, unsigned.value);
      }
    }
    reply.clearCookie(COOKIE_NAME, cookieOptions());
    return { ok: true };
  });

  // Cheap unauthenticated probe: returns 200 + label if a valid cookie is present,
  // 401 otherwise. The client uses this to decide whether to render /login.
  app.get('/auth/me', async (req, reply) => {
    const raw = req.cookies[COOKIE_NAME];
    if (!raw) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    const row = await lookupSession(c, unsigned.value);
    if (!row) return reply.status(401).send({ code: 'UNAUTHENTICATED' });
    return { label: row.label, role: row.role ?? 'admin', worldVerified: isWorldVerified(row), worldTier: row.worldTier ?? null };
  });
}
