import crypto from 'node:crypto';
import type { Collection, Document } from 'mongodb';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { config } from '../config.js';

export const COOKIE_NAME = 'hoc_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Access roles, mirroring the three human levels of docs/05-architecture-bounty-map.md
 *  plus `admin` (demo operator, full access). Invites without a role are treated as
 *  admin so pre-role codes keep working. */
export const ROLES = ['admin', 'government', 'military', 'spotter'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionRow extends Document {
  _id: string;
  code: string;
  label: string;
  role?: Role;
  createdAt: Date;
  expiresAt: Date;
}

export interface InviteRow extends Document {
  _id: string;
  label: string;
  role?: Role;
  createdAt: Date;
  revoked?: boolean;
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
  };
  await c.sessions.insertOne(row);
  return row;
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
