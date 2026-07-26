import type { Collections, SettingsDoc } from '../db.js';
import { DEFAULT_RULE, type SettlementRule } from '../hedera/settle.js';

/** The one active government policy, or the built-in default when none is set. */
export async function loadActiveRule(c: Collections): Promise<SettlementRule> {
  const doc = await c.settings.findOne({ _id: 'active' });
  return doc?.rule ?? DEFAULT_RULE;
}

/** Persist the active government policy (upsert of the singleton settings doc). */
export async function saveActiveRule(
  c: Collections,
  rule: SettlementRule,
  updatedBy: string,
): Promise<SettlementRule> {
  const doc: SettingsDoc = { _id: 'active', rule, updatedBy, updatedAt: new Date() };
  await c.settings.replaceOne({ _id: 'active' }, doc, { upsert: true });
  return rule;
}
