import type { Collection, Document } from 'mongodb';
import type { Collections } from '../db.js';
import { DEFAULT_DIVERGENCE } from '@shared/schemas/threat';
import { generateBattlefieldCode } from './battlefieldCode.js';

/** Idempotent field migrations that bring persisted documents in line with the current
 *  schema. Run at boot (server/src/index.ts) and via `npm run migrate:fields`.
 *
 *   1. interceptors — drop `site` (removed from launchers).
 *   2. threats      — drop `note` plus fields retired earlier (etaSec, targetName, intercept,
 *                     geometry.uncertaintyBounds, geometry.passingLine).
 *   3. threat_types — collapse `typicalSpeedKmh` from { min, max } to a single number
 *                     (uses the former `min`, which equalled `max`).
 *   4. interceptors / teams / threats — backfill missing or empty `battlefieldCode` with a
 *      generated unique code (assets created via the UI before generation existed have '').
 *   5. threats — backfill `geometry.divergence` on threats that have a detonation point but
 *      predate the divergence feature (the map only draws the zone when the field exists).
 *   6. teams — move crew display codes off the legacy `T<n>`/`T-<n>` defaults to the `C<n>`
 *      scheme so a crew can never read as a threat code (threats are `T-<n>`).
 *
 *  Each step only matches documents that still carry the old shape, so re-runs are no-ops. */

/** Backfill blank/missing battlefieldCode across a set of asset collections, keeping the
 *  generated codes unique across all of them. Idempotent: only writes to docs whose code
 *  is missing/empty/null. Returns the number of docs updated. */
export async function backfillBattlefieldCodesAcross(cols: Collection<Document>[]): Promise<number> {
  const taken = new Set<string>();
  for (const col of cols) {
    const docs = await col
      .find({ battlefieldCode: { $exists: true, $nin: ['', null] } })
      .project({ battlefieldCode: 1 })
      .toArray();
    for (const d of docs) taken.add(String(d.battlefieldCode));
  }
  let total = 0;
  for (const col of cols) total += await backfillBattlefieldCodes(col, taken);
  return total;
}

/** Backfill blank/missing battlefieldCode on every doc in `col`, keeping codes unique
 *  across the whole battlefield (the `taken` set spans all asset collections). */
async function backfillBattlefieldCodes(col: Collection<Document>, taken: Set<string>): Promise<number> {
  const blanks = await col
    .find({ $or: [{ battlefieldCode: { $exists: false } }, { battlefieldCode: '' }, { battlefieldCode: null }] })
    .project({ _id: 1 })
    .toArray();
  for (const doc of blanks) {
    let code = generateBattlefieldCode();
    while (taken.has(code)) code = generateBattlefieldCode();
    taken.add(code);
    await col.updateOne({ _id: doc._id }, { $set: { battlefieldCode: code } });
  }
  return blanks.length;
}

/** Rename live crews still carrying a legacy `T<n>` / `T-<n>` default code to `C<n>`,
 *  keeping codes unique per layer. The numeric part is preserved when free (T1 → C1),
 *  otherwise the smallest unused C-number in that layer is taken. Manually customized
 *  codes (anything not matching the legacy default shape) are left alone. */
export async function migrateCrewCodes(teams: Collection<Document>): Promise<number> {
  const legacy = await teams
    .find({ deletedAt: null, code: { $regex: '^T-?\\d+$' } })
    .project({ _id: 1, layerId: 1, code: 1 })
    .toArray();
  if (legacy.length === 0) return 0;

  // C-numbers already in use, per layer (only live crews can collide in the UI).
  const usedByLayer = new Map<string, Set<number>>();
  const existing = await teams
    .find({ deletedAt: null, code: { $regex: '^C\\d+$' } })
    .project({ layerId: 1, code: 1 })
    .toArray();
  for (const d of existing) {
    const key = String(d.layerId);
    if (!usedByLayer.has(key)) usedByLayer.set(key, new Set());
    usedByLayer.get(key)!.add(parseInt(String(d.code).slice(1), 10));
  }

  for (const doc of legacy) {
    const key = String(doc.layerId);
    if (!usedByLayer.has(key)) usedByLayer.set(key, new Set());
    const used = usedByLayer.get(key)!;
    let n = parseInt(String(doc.code).replace(/^T-?/, ''), 10);
    if (!Number.isFinite(n) || n < 1 || used.has(n)) {
      n = 1;
      while (used.has(n)) n += 1;
    }
    used.add(n);
    await teams.updateOne({ _id: doc._id }, { $set: { code: `C${n}` } });
  }
  return legacy.length;
}

export async function runFieldMigrations(c: Collections): Promise<Record<string, number>> {
  const siteRes = await c.interceptors.updateMany(
    { site: { $exists: true } },
    { $unset: { site: '' } },
  );

  const threatRes = await c.threats.updateMany(
    {
      $or: [
        { note: { $exists: true } },
        { etaSec: { $exists: true } },
        { targetName: { $exists: true } },
        { intercept: { $exists: true } },
        { 'geometry.uncertaintyBounds': { $exists: true } },
        { 'geometry.passingLine': { $exists: true } },
      ],
    },
    {
      $unset: {
        note: '',
        etaSec: '',
        targetName: '',
        intercept: '',
        'geometry.uncertaintyBounds': '',
        'geometry.passingLine': '',
      },
    },
  );

  // Collapse typicalSpeedKmh { min, max } → number. Only docs still holding the object shape.
  const speedRes = await c.threatTypes.updateMany(
    { 'typicalSpeedKmh.min': { $exists: true } },
    [{ $set: { typicalSpeedKmh: '$typicalSpeedKmh.min' } }],
  );

  const backfilled = await backfillBattlefieldCodesAcross([c.interceptors, c.teams, c.threats]);

  // A detonation point must always come with its divergence zone; threats created
  // before the feature existed (or with divergence: null) get the default.
  const divergenceRes = await c.threats.updateMany(
    {
      'geometry.detonation': { $exists: true, $ne: null },
      $or: [{ 'geometry.divergence': { $exists: false } }, { 'geometry.divergence': null }],
    },
    { $set: { 'geometry.divergence': { ...DEFAULT_DIVERGENCE } } },
  );

  const crewCodesRenamed = await migrateCrewCodes(c.teams);

  // Backfill `kind` on legacy `layers` rows that pre-date the discriminator.
  // Every layer is a sector, so treat missing `kind` as 'sector'.
  const layerKindRes = await c.layers.updateMany(
    { kind: { $exists: false } },
    { $set: { kind: 'sector' } },
  );

  return {
    interceptorsSiteUnset: siteRes.modifiedCount,
    threatsLegacyCleaned: threatRes.modifiedCount,
    threatTypesSpeedCollapsed: speedRes.modifiedCount,
    battlefieldCodesBackfilled: backfilled,
    threatsDivergenceBackfilled: divergenceRes.modifiedCount,
    crewCodesRenamed,
    layerKindBackfilled: layerKindRes.modifiedCount,
  };
}
