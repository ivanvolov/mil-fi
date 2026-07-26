import crypto from 'node:crypto';
import type { Collection, Document } from 'mongodb';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { config } from '../config.js';

export const COOKIE_NAME = 'hoc_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Access roles, mirroring the three human levels of docs/03-architecture-bounty-map.md
 *  plus `admin` (demo operator, full access). Invites without a role are treated as
 *  admin so pre-role codes keep working. */
export const ROLES = ['admin', 'government', 'military', 'spotter'] as const;
export type Role = (typeof ROLES)[number];

/** One of the World ID credentials IDKit can hand back. */
export type WorldCredentialType = 'selfie' | 'passport' | 'proof_of_human' | 'unknown';

/** Fields recording a one-time World ID verification. Present once the holder has
 * completed it, absent otherwise — never re-checked once set (see markWorldVerified). */
interface WorldVerificationFields {
  worldNullifier?: string;
  worldTier?: number;
  worldCredentialType?: WorldCredentialType;
  worldVerifiedAt?: Date;
}

export interface SessionRow extends Document, WorldVerificationFields {
  _id: string;
  code: string;
  label: string;
  role?: Role;
  createdAt: Date;
  expiresAt: Date;
}

export interface InviteRow extends Document, WorldVerificationFields {
  _id: string;
  label: string;
  role?: Role;
  /** Optional username/password login (demo role accounts). When set, the user
   * signs in with these instead of a numeric invite code. */
  username?: string;
  passwordHash?: string;
  createdAt: Date;
  revoked?: boolean;
}

/** Demo-grade password hashing — unsalted sha256. Fine for shared demo accounts;
 * not for real user passwords. */
export function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

export interface AuthCollections {
  invites: Collection<InviteRow>;
  sessions: Collection<SessionRow>;
}

export function newSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function cookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    signed: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function createSession(
  c: AuthCollections,
  invite: InviteRow,
): Promise<SessionRow> {
  const now = new Date();
  const row: SessionRow = {
    _id: newSessionId(),
    code: invite._id,
    label: invite.label,
    role: invite.role ?? 'admin',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    // Carries a prior World ID verification forward, so a returning already-verified
    // user skips the gate immediately at login rather than waiting on the next /auth/me poll.
    ...(invite.worldNullifier
      ? {
          worldNullifier: invite.worldNullifier,
          worldTier: invite.worldTier,
          worldCredentialType: invite.worldCredentialType,
          worldVerifiedAt: invite.worldVerifiedAt,
        }
      : {}),
  };
  await c.sessions.insertOne(row);
  return row;
}

/** True when this role never needs World ID verification (admin), or the holder has
 * already completed it once. World ID is a one-time confirmation, not a login step —
 * once `worldNullifier` is on record, it is never re-checked. */
export function isWorldVerified(row: { role?: Role; worldNullifier?: string }): boolean {
  return (row.role ?? 'admin') === 'admin' || row.worldNullifier != null;
}

/** Records a completed World ID verification against the invite (permanent) and the
 * live session (so the current request doesn't need a re-login to see it). */
export async function markWorldVerified(
  c: AuthCollections,
  inviteId: string,
  sessionId: string,
  verification: { nullifier: string; tier: number; credentialType: WorldCredentialType },
): Promise<void> {
  const fields: WorldVerificationFields = {
    worldNullifier: verification.nullifier,
    worldTier: verification.tier,
    worldCredentialType: verification.credentialType,
    worldVerifiedAt: new Date(),
  };
  await Promise.all([
    c.invites.updateOne({ _id: inviteId }, { $set: fields }),
    c.sessions.updateOne({ _id: sessionId }, { $set: fields }),
  ]);
}

export async function lookupSession(
  c: AuthCollections,
  sessionId: string,
): Promise<SessionRow | null> {
  const now = new Date();
  return c.sessions.findOne({ _id: sessionId, expiresAt: { $gt: now } });
}

export async function refreshSession(
  c: AuthCollections,
  sessionId: string,
): Promise<void> {
  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await c.sessions.updateOne({ _id: sessionId }, { $set: { expiresAt: newExpiry } });
}

export async function destroySession(
  c: AuthCollections,
  sessionId: string,
): Promise<void> {
  await c.sessions.deleteOne({ _id: sessionId });
}

export function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
}
