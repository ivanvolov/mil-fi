import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { config } from './config.js';
import { connectDb, closeDb } from './db.js';
import { seedIfEmpty } from './services/seed.js';
import { registerTypeRoutes } from './routes/types.js';
import { registerLayerRoutes } from './routes/layers.js';
import { registerInterceptorRoutes } from './routes/interceptors.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerThreatRoutes } from './routes/threats.js';
import { registerThreadRoutes } from './routes/threads.js';
import { registerDrawingRoutes } from './routes/drawings.js';
import { registerExternalRoutes } from './routes/external.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerHookRoutes } from './routes/hooks.js';
import { makeRequireSession } from './auth/middleware.js';
import { HttpError } from './lib/crud.js';
import { refreshFromProdIfStaging } from './lib/refreshDb.js';
import { runFieldMigrations } from './lib/migrateFields.js';
import { notifyBoot } from './lib/telegram.js';

async function main() {
  // Boot-time DB refresh: on the staging Render service (NODE_ENV=production and
  // MONGODB_DB ends in `-staging`), drop staging DB and copy prod DB in before
  // Fastify starts. Bypasses Render's preDeployCommand entirely so we can rely on
  // it firing every deploy. Prod service + local dev are no-ops.
  const refreshResult = await refreshFromProdIfStaging();
  let didRefresh = false;
  if (refreshResult.skipped) {
    console.log(`[refresh-db] skipped: ${refreshResult.reason}`);
  } else if (refreshResult.collections) {
    console.log(`[refresh-db] refreshed ${refreshResult.targetDb} from ${refreshResult.sourceDb}`);
    didRefresh = true; // TG notice fired below once active invite codes are known.
  }

  const app = Fastify({ logger: { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } } } });

  // CORS only matters for the dev split (Vite :5173 → Fastify :3001). In prod
  // we serve the SPA from the same origin and credentials still flow.
  await app.register(cors, { origin: config.clientOrigin, credentials: true });
  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, {
    global: false, // we attach it per-route on /auth/login
    max: 100,
    timeWindow: '1 minute',
  });

  const { collections } = await connectDb();
  const seedResult = await seedIfEmpty(collections);
  app.log.info({ seedResult }, 'seed check');

  // Idempotent field migrations — bring any pre-existing docs in line with the current
  // schema (drop removed fields, collapse typicalSpeedKmh to a scalar). No-op once applied.
  const migrationCounts = await runFieldMigrations(collections);
  app.log.info({ migrationCounts }, 'field migrations');

  // Print active invite codes on boot so the operator doesn't have to hunt through Mongo
  // after a restart. Uses plain console.log (not the pino logger) so the banner stays legible
  // in the terminal.
  const activeInvites = await collections.invites.find({ revoked: { $ne: true } }).toArray();
  if (activeInvites.length === 0) {
    console.log('\n[invites] ⚠ no active invite codes — run `npm run seed:invites` in server/\n');
  } else {
    console.log(`\n[invites] ${activeInvites.length} active code(s):`);
    for (const inv of activeInvites) console.log(`  ${inv._id}  →  ${inv.label}`);
    console.log('');
  }
  // First 5 active invite codes travel with the boot notifications (notifyBoot caps at 5).
  const bootInviteCodes = activeInvites.map((inv) => inv._id);
  if (didRefresh) void notifyBoot('refreshed', bootInviteCodes);

  const requireSession = makeRequireSession(collections);

  app.get('/api/v1/health', async () => ({ ok: true, db: config.mongoDb }));

  // Auth routes mounted under /api/v1 but BEFORE the requireSession preHandler.
  await app.register(async (api) => {
    await registerAuthRoutes(api, collections);
  }, { prefix: '/api/v1' });

  // Render → Telegram deploy notifier. Public endpoint (Render can't send session cookies);
  // guarded by HMAC signature verification against RENDER_WEBHOOK_SECRET. Encapsulated in
  // its own plugin so its raw-body JSON parser doesn't affect the rest of the API.
  await app.register(async (api) => {
    await registerHookRoutes(api);
  }, { prefix: '/api/v1' });

  // Everything else under /api/v1 requires an authenticated session.
  await app.register(async (api) => {
    api.addHook('preHandler', requireSession);
    await registerTypeRoutes(api, collections);
    await registerLayerRoutes(api, collections);
    await registerInterceptorRoutes(api, collections);
    await registerTeamRoutes(api, collections);
    await registerThreatRoutes(api, collections);
    await registerThreadRoutes(api, collections);
    await registerDrawingRoutes(api, collections);
    await registerExternalRoutes(api);
    await registerAiRoutes(api, collections);
  }, { prefix: '/api/v1' });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ code: err.code, message: err.message, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ code: 'VALIDATION', message: 'invalid request', details: err.issues });
    }
    app.log.error(err);
    const message = err instanceof Error ? err.message : 'internal error';
    return reply.status(500).send({ code: 'INTERNAL', message });
  });

  // In production (or when SERVE_STATIC=true) serve the built SPA and fall
  // back to index.html on unknown GETs so React Router's deep links work.
  if (config.serveStatic) {
    // Resolve from cwd, not __dirname: in dev (tsx) and prod (compiled), npm
    // is launched from server/, so this single path covers both.
    const distRoot = path.resolve(process.cwd(), config.clientDistPath);
    await app.register(fastifyStatic, { root: distRoot, prefix: '/', wildcard: false });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'not found' });
      }
      return reply.type('text/html').sendFile('index.html');
    });
    app.log.info({ distRoot }, 'serving static SPA');
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: '0.0.0.0' });

  // Fire-and-forget TG boot notice (skipped if not production or creds missing).
  // Only send the plain "started" ping if we didn't already send a "refreshed" one above.
  if (!refreshResult.collections) {
    void notifyBoot('started', bootInviteCodes);
  }
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
