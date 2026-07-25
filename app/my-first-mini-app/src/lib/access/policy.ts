/**
 * The access policy: which verification tier each capability demands.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE CHANGING ANYTHING
 *
 * Enforcement is currently OFF. Every capability resolves to Tier.UNVERIFIED at
 * runtime, so all features are open to everyone. This is deliberate: we are
 * building the functionality first and switching the locks on afterwards.
 *
 * The real policy is still written down below, and it is the single place that
 * decides who may do what. Turning the system on is one environment variable —
 * not a refactor — because every call site already asks `can()` rather than
 * checking tiers inline.
 *
 *     ACCESS_ENFORCEMENT=on
 *
 * Keep the table accurate as features land, even while enforcement is off.
 * A stale table is worse than no table: it reads as intent that was never true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Tier } from './tiers';

/**
 * Every gated action in MilFi. Adding a capability here and using it at the call
 * site is the only supported way to gate a feature — never compare tiers inline.
 */
export type Capability =
  /** Submit a threat report with photo proof. */
  | 'report:submit'
  /** Read reports submitted by other units. */
  | 'report:view'
  /** Be assigned, and accept, a tasking. */
  | 'tasking:accept'
  /** Confirm an agent's tasking recommendation — authorises the use of force. */
  | 'tasking:confirm'
  /** Attach proof that a tasking was carried out. */
  | 'strike:submit-proof'
  /** Release funds against a verified report or completed tasking. */
  | 'payment:release';

/**
 * Target policy — what each capability WILL require once enforcement is on.
 *
 * The shape mirrors the three actors in the product:
 *   Selfie-verified observing units report.
 *   Passport-verified, allow-listed units get tasked.
 *   Orb-verified government confirms force and moves money.
 */
export const CAPABILITY_TIERS: Record<Capability, Tier> = {
  'report:submit': Tier.BASIC,
  'report:view': Tier.VERIFIED,
  'tasking:accept': Tier.VERIFIED,
  // Authorising force and releasing public funds both sit at the top tier.
  // Neither should ever be reachable without Orb + an allow-listed passport.
  'tasking:confirm': Tier.ELEVATED,
  'strike:submit-proof': Tier.VERIFIED,
  'payment:release': Tier.ELEVATED,
};

/**
 * Enforcement is opt-IN via env, but note the asymmetry: when the flag is unset
 * we open everything, and when identity cannot be resolved we deny everything
 * (see ANONYMOUS in tiers.ts). Build-phase convenience never silently becomes a
 * production posture, because turning enforcement on makes the safe default win.
 */
export function enforcementEnabled(): boolean {
  return process.env.ACCESS_ENFORCEMENT === 'on';
}

/**
 * The tier a capability demands right now.
 *
 * While enforcement is off this is always Tier.UNVERIFIED. Read
 * `CAPABILITY_TIERS` directly when you want the eventual policy — for example to
 * show a user what a feature will require — rather than what is enforced today.
 */
export function requiredTier(capability: Capability): Tier {
  return enforcementEnabled()
    ? CAPABILITY_TIERS[capability]
    : Tier.UNVERIFIED;
}
