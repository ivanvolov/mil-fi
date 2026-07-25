import { ObjectId } from 'mongodb';
import type { Collections } from '../db.js';
import { newTimestamps } from '../lib/doc.js';
import { INTERCEPTOR_TYPES, THREAT_TYPES } from './spec.js';

/** 8-char lowercase base36 layer slug — same format used by client + duplicate route. */
function randomLayerSlug(): string {
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

/**
 * Idempotent seed of the VZIL 1 layer + the 4 interceptor types and 2 threat types
 * mirrored from ./spec.verification.yaml.
 * Runs once on first server boot; bails immediately if any non-deleted layer exists.
 */
export async function seedIfEmpty(c: Collections): Promise<{ seeded: boolean; reason?: string }> {
  const existing = await c.layers.countDocuments({ deletedAt: null });
  if (existing > 0) return { seeded: false, reason: 'layers already exist' };

  // ---------- interceptor types ----------
  const interceptorTypeDocs = INTERCEPTOR_TYPES.map((t) => ({ _id: new ObjectId(), ...t, ...newTimestamps() }));
  await c.interceptorTypes.insertMany(interceptorTypeDocs);
  const T: Record<string, ObjectId> = Object.fromEntries(interceptorTypeDocs.map((d) => [d.key, d._id]));

  // ---------- threat types ----------
  const threatTypeDocs = THREAT_TYPES.map((t) => ({ _id: new ObjectId(), ...t, ...newTimestamps() }));
  await c.threatTypes.insertMany(threatTypeDocs);
  const TT: Record<string, ObjectId> = Object.fromEntries(threatTypeDocs.map((d) => [d.key, d._id]));

  // ---------- layer ----------
  const layerId = new ObjectId();
  await c.layers.insertOne({
    _id: layerId,
    name: 'VZIL 1',
    slug: randomLayerSlug(),
    description: 'TES Ivanoff / Kivske (Burshtyn TES — Ivano-Frankivsk)',
    mapCenter: { lat: 49.216195, lng: 24.663363 },
    mapZoom: 13,
    isActive: true,
    ...newTimestamps(),
  });

  // ---------- interceptors (only types in the verified spec) ----------
  const launchersSeed: Array<{
    code: string;
    battlefieldCode: string;
    typeKey: string;
    lat: number;
    lng: number;
    state: 'ready' | 'reload' | 'offline';
    ammo: { ready: number; reload: number; capacity: number; reloadEtaSec: number | null } | null;
  }> = [
    { code: 'L-12', battlefieldCode: '41277521', typeKey: 'sting',        lat: 49.225389, lng: 24.622421, state: 'ready',  ammo: { ready: 6, reload: 2, capacity: 8, reloadEtaSec: null } },
    { code: 'L-3',  battlefieldCode: '43108432', typeKey: 'p1-sun-long',  lat: 49.232396, lng: 24.637442, state: 'ready',  ammo: { ready: 6, reload: 0, capacity: 6, reloadEtaSec: null } },
    { code: 'L-7',  battlefieldCode: '30459217', typeKey: 'merops',       lat: 49.226006, lng: 24.702759, state: 'reload', ammo: { ready: 0, reload: 4, capacity: 4, reloadEtaSec: 22 } },
    { code: 'L-9',  battlefieldCode: '49126733', typeKey: 'sting',        lat: 49.204701, lng: 24.687824, state: 'ready',  ammo: { ready: 6, reload: 0, capacity: 6, reloadEtaSec: null } },
    { code: 'L-15', battlefieldCode: '71334821', typeKey: 'p1-sun-long',  lat: 49.208065, lng: 24.639931, state: 'ready',  ammo: { ready: 4, reload: 0, capacity: 4, reloadEtaSec: null } },
    { code: 'MFG-2',battlefieldCode: '80231742', typeKey: 'mfg',          lat: 49.232844, lng: 24.694347, state: 'ready',  ammo: null },
    { code: 'MFG-4',battlefieldCode: '80232104', typeKey: 'mfg',          lat: 49.197298, lng: 24.645596, state: 'ready',  ammo: null },
  ];
  const interceptorDocs = launchersSeed.map((s) => ({
    _id: new ObjectId(),
    layerId,
    typeId: T[s.typeKey]!,
    code: s.code,
    battlefieldCode: s.battlefieldCode,
    position: { lat: s.lat, lng: s.lng },
    state: s.state,
    ammo: s.ammo,
    constraints: null,
    ...newTimestamps(),
  }));
  await c.interceptors.insertMany(interceptorDocs);
  const I: Record<string, ObjectId> = Object.fromEntries(interceptorDocs.map((d) => [d.code, d._id]));

  // ---------- teams ----------
  const teamsSeed = [
    { code: 'C1', battlefieldCode: '11041208', lat: 49.232564, lng: 24.622421, role: 'local · NW/SW group', isElite: false, controlsCodes: ['L-12', 'L-3', 'L-15'] },
    { code: 'C2', battlefieldCode: '11075513', lat: 49.230490, lng: 24.694691, role: 'local · NE/SE group · co-located with reload site (L-7)', isElite: false, controlsCodes: ['L-7', 'L-9'] },
    { code: 'C3', battlefieldCode: '11099201', lat: 49.211990, lng: 24.661903, role: 'elite · inside Burshtyn TES · can override any remote-controllable asset', isElite: true,  controlsCodes: ['L-12', 'L-3', 'L-7', 'L-9', 'L-15'] },
  ];
  const teamDocs = teamsSeed.map((t) => ({
    _id: new ObjectId(),
    layerId,
    code: t.code,
    battlefieldCode: t.battlefieldCode,
    position: { lat: t.lat, lng: t.lng },
    role: t.role,
    isElite: t.isElite,
    ...newTimestamps(),
  }));
  await c.teams.insertMany(teamDocs);
  const TM: Record<string, ObjectId> = Object.fromEntries(teamDocs.map((d) => [d.code, d._id]));

  // ---------- threads ----------
  const threadDocs = teamsSeed.flatMap((t) =>
    t.controlsCodes.map((code) => ({
      _id: new ObjectId(),
      layerId,
      teamId: TM[t.code]!,
      interceptorId: I[code]!,
      kind: t.isElite ? 'override' : 'primary',
      ...newTimestamps(),
    })),
  );
  await c.threads.insertMany(threadDocs);

  // ---------- threats ----------
  await c.threats.insertMany([
    {
      _id: new ObjectId(),
      layerId,
      typeId: TT['shahed-136']!,
      code: 'T-1',
      battlefieldCode: '99100201',
      position: { lat: 49.247750, lng: 24.670830 },
      altitudeM: 300,
      speedKmh: 180,
      descentPhaseM: 500,
      geometry: {
        pastPath: [
          { lat: 49.265, lng: 24.77 },
          { lat: 49.25, lng: 24.73 },
          { lat: 49.265452, lng: 24.726448 },
          { lat: 49.24775, lng: 24.67083 },
        ],
        futureCruise: [
          { lat: 49.24775, lng: 24.67083 },
          { lat: 49.220849, lng: 24.679585 },
        ],
        futureAttack: [
          { lat: 49.220849, lng: 24.679585 },
          { lat: 49.206495, lng: 24.66774 },
        ],
        detonation: { lat: 49.206495, lng: 24.66774, radiusM: 180 },
        divergence: { widthM: 3000, heightM: 1500 },
      },
      ...newTimestamps(),
    },
    {
      _id: new ObjectId(),
      layerId,
      typeId: TT['shahed-136']!,
      code: 'T-2',
      battlefieldCode: '99100202',
      position: { lat: 49.186, lng: 24.665 },
      altitudeM: 280,
      speedKmh: 175,
      descentPhaseM: 500,
      geometry: {
        pastPath: [
          { lat: 49.205, lng: 24.66 },
          { lat: 49.186, lng: 24.665 },
        ],
        futureCruise: [
          { lat: 49.186, lng: 24.665 },
          { lat: 49.1805, lng: 24.665 },
        ],
        futureAttack: [
          { lat: 49.1805, lng: 24.665 },
          { lat: 49.176, lng: 24.665 },
        ],
        detonation: { lat: 49.176, lng: 24.665, radiusM: 160 },
        divergence: { widthM: 2500, heightM: 1200 },
      },
      ...newTimestamps(),
    },
  ]);

  // ---------- drawings ----------
  await c.drawings.insertOne({
    _id: new ObjectId(),
    layerId,
    kind: 'noEngagementZone',
    name: 'TES no-engagement polygon',
    geometry: {
      type: 'polygon',
      points: [
        { lat: 49.223150351990014, lng: 24.649086460795434 },
        { lat: 49.207979824354986, lng: 24.675129154922917 },
        { lat: 49.201550414665746, lng: 24.67352804418505 },
        { lat: 49.22314414076817, lng: 24.63816701693119 },
      ],
    },
    style: { stroke: '#b04a3a', fill: '#b04a3a', patternId: 'brick-hatch', weight: 2, dashArray: null },
    visible: true,
    ...newTimestamps(),
  });

  return { seeded: true };
}
