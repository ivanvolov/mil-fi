/**
 * Rate limiting utility — in-memory sliding window.
 *
 * Ported from the Regata project, but deliberately SIMPLIFIED: Regata's version
 * required Upstash Redis. This v1 has no database and no Redis, so this keeps the
 * same API surface and graceful-degradation philosophy with zero external services.
 *
 * ⚠️ LIMITATION: state lives in process memory. On serverless (Vercel/Netlify) each
 * instance keeps its own counters, so real limits are looser than configured and reset
 * on cold start. That is acceptable as basic abuse protection, NOT as a security control.
 *
 * UPGRADE PATH: when a datastore is added, swap the Map for Upstash Redis
 * (`@upstash/ratelimit` + `@upstash/redis`) behind this same `checkRateLimit()` signature.
 * Nothing that calls this file needs to change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('rate-limit');

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Evict buckets with no recent hits so the Map cannot grow without bound. */
function sweep(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

let sweepCounter = 0;

export interface RateLimitConfig {
  /** Identifier used in the bucket key, e.g. 'verify-proof' */
  name: string;
  /** Max requests allowed per window */
  limit: number;
  /** Window length in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the oldest hit in the window expires */
  reset: number;
}

/**
 * Best-effort client identifier. Prefers proxy-forwarded IP headers.
 * Falls back to a constant, which means one shared bucket — intentionally
 * conservative rather than silently disabling the limit.
 */
export function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Check and record a request against a rate limit.
 *
 * @example
 * const result = checkRateLimit(getClientId(request), {
 *   name: 'verify-proof', limit: 10, windowMs: 60_000,
 * });
 * if (!result.success) return rateLimitResponse(result);
 */
export function checkRateLimit(
  clientId: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = `${config.name}:${clientId}`;

  // Periodic sweep — every 100 calls, cheap enough to do inline.
  if (++sweepCounter % 100 === 0) sweep(now, config.windowMs);

  const bucket = buckets.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < config.windowMs);

  const success = bucket.hits.length < config.limit;
  if (success) bucket.hits.push(now);
  buckets.set(key, bucket);

  const oldest = bucket.hits[0] ?? now;

  if (!success) {
    log.warn({ clientId, name: config.name, limit: config.limit }, 'Rate limit exceeded');
  }

  return {
    success,
    limit: config.limit,
    remaining: Math.max(0, config.limit - bucket.hits.length),
    reset: oldest + config.windowMs,
  };
}

/** Standard 429 response with the conventional rate-limit headers. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
        'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
      },
    }
  );
}

/** Suggested defaults. Tune per route as the app grows. */
export const LIMITS = {
  /** Proof verification — expensive, and abuse-sensitive */
  verify: { name: 'verify', limit: 10, windowMs: 60_000 },
  /** Payment initiation */
  pay: { name: 'pay', limit: 20, windowMs: 60_000 },
  /** General authenticated reads */
  read: { name: 'read', limit: 100, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;
