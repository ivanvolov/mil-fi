import { MongoClient, type Db, type Collection, type Document } from 'mongodb';
import { config } from './config.js';
import type { InviteRow, SessionRow } from './auth/session.js';

export interface BaseDoc {
  _id: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

/** A unit that can file reports / receive payouts. String _id (unit code). */
export interface UnitDoc {
  _id: string;
  hederaAccountId: string | null;
  hederaPrivateKey: string | null;
  hederaPublicKey: string | null;
  humanBackingLevel: 'government' | 'spotter' | 'military';
  humanBacked: boolean;
  worldProof: unknown;
  /** World identity used to pull a signed payout authorization (Interface 1). */
  worldNullifier: string | null;
  worldTier: number | null;
  kyc: { associateTx: string; kycTx: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One engagement's full trail. Loose beyond the keys we query on. */
export interface EngagementDoc {
  _id: string;
  unitId: string;
  createdAt: Date;
  [k: string]: unknown;
}

/** One civilian spotter sighting: single image → Agent A verdict. */
export interface SpotDoc {
  _id: string;
  spotterLabel: string;
  createdAt: Date;
  [k: string]: unknown;
}

export interface Collections {
  interceptorTypes: Collection<Document>;
  threatTypes: Collection<Document>;
  layers: Collection<Document>;
  interceptors: Collection<Document>;
  threats: Collection<Document>;
  teams: Collection<Document>;
  threads: Collection<Document>;
  drawings: Collection<Document>;
  invites: Collection<InviteRow>;
  sessions: Collection<SessionRow>;
  // MilFi settlement layer
  units: Collection<UnitDoc>;
  engagements: Collection<EngagementDoc>;
  spots: Collection<SpotDoc>;
}

let _client: MongoClient | null = null;
let _db: Db | null = null;
let _collections: Collections | null = null;

export async function connectDb(): Promise<{ client: MongoClient; db: Db; collections: Collections }> {
  if (_client && _db && _collections) return { client: _client, db: _db, collections: _collections };

  _client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });
  await _client.connect();
  _db = _client.db(config.mongoDb);

  _collections = {
    interceptorTypes: _db.collection('interceptor_types'),
    threatTypes: _db.collection('threat_types'),
    layers: _db.collection('layers'),
    interceptors: _db.collection('interceptors'),
    threats: _db.collection('threats'),
    teams: _db.collection('teams'),
    threads: _db.collection('threads'),
    drawings: _db.collection('drawings'),
    invites: _db.collection<InviteRow>('invites'),
    sessions: _db.collection<SessionRow>('sessions'),
    units: _db.collection<UnitDoc>('units'),
    engagements: _db.collection<EngagementDoc>('engagements'),
    spots: _db.collection<SpotDoc>('spots'),
  };

  await ensureIndexes(_collections);
  return { client: _client, db: _db, collections: _collections };
}

async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.interceptorTypes.createIndex({ key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }),
    c.threatTypes.createIndex({ key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }),

    c.layers.createIndex({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }),
    c.layers.createIndex({ isActive: 1 }),

    c.interceptors.createIndex({ layerId: 1 }),
    c.interceptors.createIndex({ typeId: 1 }),
    c.interceptors.createIndex(
      { layerId: 1, code: 1 },
      { unique: true, partialFilterExpression: { deletedAt: null } },
    ),

    c.threats.createIndex({ layerId: 1 }),
    c.threats.createIndex({ typeId: 1 }),

    c.teams.createIndex({ layerId: 1 }),
    c.teams.createIndex(
      { layerId: 1, code: 1 },
      { unique: true, partialFilterExpression: { deletedAt: null } },
    ),

    c.threads.createIndex({ layerId: 1 }),
    c.threads.createIndex({ teamId: 1 }),
    c.threads.createIndex({ interceptorId: 1 }),
    c.threads.createIndex(
      { layerId: 1, teamId: 1, interceptorId: 1 },
      { unique: true, partialFilterExpression: { deletedAt: null } },
    ),

    c.drawings.createIndex({ layerId: 1 }),

    // auth: TTL index — MongoDB auto-removes session rows past expiresAt
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.sessions.createIndex({ code: 1 }),

    // settlement layer
    c.units.createIndex({ hederaAccountId: 1 }),
    c.engagements.createIndex({ unitId: 1 }),
    c.engagements.createIndex({ createdAt: -1 }),
    c.spots.createIndex({ createdAt: -1 }),
  ]);
}

export async function closeDb() {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
    _collections = null;
  }
}
