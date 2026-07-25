/**
 * One-shot migration: bring live Mongo into alignment with services/spec.verification.yaml.
 *
 * For each interceptor type listed in INTERCEPTOR_TYPES: upsert envelope/loadout/displayName.
 * For each threat type listed in THREAT_TYPES: upsert speed/altitude bands.
 * For legacy keys in RENAMED_INTERCEPTOR_KEYS: rewrite key + fields (preserves _id so
 *   existing interceptor instances continue to resolve their typeId).
 * For legacy keys in RETIRED_INTERCEPTOR_KEYS that don't have a rename mapping: soft-delete.
 * For any interceptor whose typeId now points to a soft-deleted type: soft-delete.
 * For any thread whose interceptorId is soft-deleted: soft-delete.
 *
 * Idempotent — safe to run repeatedly.
 *
 * Run with:  npm run migrate:specs   (from /server)
 */
import { connectDb } from '../db.js';
import {
  INTERCEPTOR_TYPES,
  THREAT_TYPES,
  RENAMED_INTERCEPTOR_KEYS,
  RETIRED_INTERCEPTOR_KEYS,
} from '../services/spec.js';

async function main() {
  const { client, collections: c } = await connectDb();

  const now = new Date();
  const stats = {
    interceptorTypesUpserted: 0,
    interceptorTypesRenamed: 0,
    interceptorTypesRetired: 0,
    threatTypesUpserted: 0,
    interceptorsRetired: 0,
    threadsRetired: 0,
  };

  // 1. Rename legacy interceptor type keys (preserves _id → instances stay linked).
  for (const [legacyKey, newKey] of Object.entries(RENAMED_INTERCEPTOR_KEYS)) {
    const target = INTERCEPTOR_TYPES.find((t) => t.key === newKey);
    if (!target) continue;
    const r = await c.interceptorTypes.updateOne(
      { key: legacyKey },
      {
        $set: {
          key: target.key,
          displayName: target.displayName,
          category: target.category,
          requiresCrew: target.requiresCrew,
          envelope: target.envelope,
          loadout: target.loadout,
          notes: target.notes,
          deletedAt: null,
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
    );
    if (r.matchedCount) stats.interceptorTypesRenamed++;
  }

  // 2. Upsert each spec interceptor type (matches by current key — rename above already ran).
  for (const t of INTERCEPTOR_TYPES) {
    const r = await c.interceptorTypes.updateOne(
      { key: t.key },
      {
        $set: {
          displayName: t.displayName,
          category: t.category,
          requiresCrew: t.requiresCrew,
          envelope: t.envelope,
          loadout: t.loadout,
          notes: t.notes,
          deletedAt: null,
          updatedAt: now,
        },
        $setOnInsert: { key: t.key, createdAt: now },
        $inc: { version: 1 },
      },
      { upsert: true },
    );
    if (r.upsertedCount || r.modifiedCount) stats.interceptorTypesUpserted++;
  }

  // 3. Soft-delete legacy interceptor type keys that don't have a rename mapping.
  const retireKeys = RETIRED_INTERCEPTOR_KEYS.filter((k) => !RENAMED_INTERCEPTOR_KEYS[k]);
  if (retireKeys.length) {
    const retiredTypes = await c.interceptorTypes
      .find({ key: { $in: retireKeys }, deletedAt: null })
      .toArray();
    const retiredTypeIds = retiredTypes.map((d) => d._id);
    if (retiredTypeIds.length) {
      const r1 = await c.interceptorTypes.updateMany(
        { _id: { $in: retiredTypeIds } },
        { $set: { deletedAt: now, updatedAt: now }, $inc: { version: 1 } },
      );
      stats.interceptorTypesRetired += r1.modifiedCount;

      // cascade: soft-delete interceptors using retired types
      const retiredInts = await c.interceptors
        .find({ typeId: { $in: retiredTypeIds }, deletedAt: null })
        .toArray();
      const retiredIntIds = retiredInts.map((d) => d._id);
      if (retiredIntIds.length) {
        const r2 = await c.interceptors.updateMany(
          { _id: { $in: retiredIntIds } },
          { $set: { deletedAt: now, updatedAt: now }, $inc: { version: 1 } },
        );
        stats.interceptorsRetired += r2.modifiedCount;

        // cascade: soft-delete threads referencing those interceptors
        const r3 = await c.threads.updateMany(
          { interceptorId: { $in: retiredIntIds }, deletedAt: null },
          { $set: { deletedAt: now, updatedAt: now }, $inc: { version: 1 } },
        );
        stats.threadsRetired += r3.modifiedCount;
      }
    }
  }

  // 4. Upsert each spec threat type.
  for (const t of THREAT_TYPES) {
    const r = await c.threatTypes.updateOne(
      { key: t.key },
      {
        $set: {
          displayName: t.displayName,
          family: t.family,
          typicalSpeedKmh: t.typicalSpeedKmh,
          typicalAltitudeM: t.typicalAltitudeM,
          warheadKg: t.warheadKg,
          descentPhaseM: t.descentPhaseM,
          notes: t.notes,
          deletedAt: null,
          updatedAt: now,
        },
        $setOnInsert: { key: t.key, createdAt: now },
        $inc: { version: 1 },
      },
      { upsert: true },
    );
    if (r.upsertedCount || r.modifiedCount) stats.threatTypesUpserted++;
  }

  console.log(JSON.stringify({ ok: true, stats }, null, 2));
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
