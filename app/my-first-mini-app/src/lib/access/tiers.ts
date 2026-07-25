/**
 * Verification tiers for MilFi.
 *
 * A user's tier is always DERIVED from the World ID credentials they hold —
 * it is never stored as a mutable field. That matters for two reasons:
 *
 *   1. Credentials expire (Selfie Check is valid for 90 days), so a tier must be
 *      able to decay on its own. A stored tier would silently go stale.
 *   2. There is no "promote user" code path to abuse. The only way up is to
 *      actually hold the credential.
 *
 * Facts from the World docs that shape this model:
 *   - Orb (Proof of Human) carries NO nationality data. It proves unique
 *     humanity, anonymously. It can therefore never satisfy the country gate.
 *   - Nationality comes ONLY from the passport / Identity Check credential, and
 *     arrives as a BOOLEAN attestation ("is nationality in the allowed set?").
 *     We never receive or store the actual nationality.
 *
 * Consequence: Orb stacks ON TOP of passport, never instead of it. Once the
 * country gate applies at a tier, every tier above it inherits the gate.
 */

/** Ascending order is load-bearing — access checks compare with `>=`. */
export enum Tier {
  /** No usable credential. Assume anyone at all. */
  UNVERIFIED = 0,
  /** Selfie Check: liveness + facial similarity. Low assurance, 90-day validity. */
  BASIC = 1,
  /** Passport (Identity Check) AND nationality inside the allow-list. */
  VERIFIED = 2,
  /** Passport + allow-listed nationality + Orb. Highest assurance available. */
  ELEVATED = 3,
}

export const TIER_LABELS: Record<Tier, string> = {
  [Tier.UNVERIFIED]: 'Unverified',
  [Tier.BASIC]: 'Basic',
  [Tier.VERIFIED]: 'Verified',
  [Tier.ELEVATED]: 'Elevated',
};

/** What a user must do to reach each tier. Surfaced in the UI as the "climb" prompt. */
export const TIER_REQUIREMENTS: Record<Tier, string> = {
  [Tier.UNVERIFIED]: 'Not verified',
  [Tier.BASIC]: 'Complete a Selfie Check',
  [Tier.VERIFIED]: 'Verify your passport (nationality must be permitted)',
  [Tier.ELEVATED]: 'Verify your passport, then complete Orb verification',
};

/**
 * Selfie Check credentials expire; passport attestations and Orb do not carry an
 * expiry we receive. Timestamps are epoch milliseconds.
 */
export interface SelfieCredential {
  verifiedAt: number;
  /** World issues Selfie Check with a 90-day validity window. */
  expiresAt: number;
}

export interface PassportCredential {
  /**
   * Result of the Identity Check attestation. `true` means the user's nationality
   * matched our allow-list. We deliberately do not carry the nationality itself —
   * Identity Check returns a boolean, and storing more would create a PII
   * honeypot we have no need for.
   */
  nationalityAllowed: boolean;
  attestedAt: number;
}

export interface OrbCredential {
  verifiedAt: number;
}

/** Everything we know about one viewer's verification state. */
export interface Credentials {
  selfie?: SelfieCredential;
  passport?: PassportCredential;
  orb?: OrbCredential;
}

/** A viewer holding nothing. Safe default whenever identity cannot be resolved. */
export const ANONYMOUS: Credentials = {};

function selfieIsValid(
  selfie: SelfieCredential | undefined,
  now: number,
): boolean {
  return selfie !== undefined && selfie.expiresAt > now;
}

/**
 * Passport counts only when the nationality attestation came back true. A user
 * who verified a passport from a country outside the allow-list holds a
 * credential, but it grants nothing — they are not merely un-promoted, they are
 * denied.
 */
function passportIsValid(passport: PassportCredential | undefined): boolean {
  return passport?.nationalityAllowed === true;
}

/**
 * Derive the tier a set of credentials earns.
 *
 * @param credentials What the viewer holds.
 * @param now Epoch ms, injectable so expiry logic stays testable.
 */
export function tierFor(
  credentials: Credentials,
  now: number = Date.now(),
): Tier {
  const passport = passportIsValid(credentials.passport);

  // Orb without a permitted passport is NOT elevated — it proves a unique human,
  // but says nothing about nationality, and the country gate is non-negotiable.
  if (passport && credentials.orb) return Tier.ELEVATED;
  if (passport) return Tier.VERIFIED;
  if (selfieIsValid(credentials.selfie, now)) return Tier.BASIC;
  return Tier.UNVERIFIED;
}

/**
 * True when the viewer presented a passport but its nationality attestation
 * failed. Distinct from "hasn't verified yet" — this user cannot progress by
 * trying harder, and the UI must say so plainly rather than inviting a retry.
 */
export function isNationalityDenied(credentials: Credentials): boolean {
  return credentials.passport?.nationalityAllowed === false;
}

/**
 * True when a Selfie Check was held but has aged out. Worth distinguishing from
 * "never verified" so the UI can prompt a quick re-check instead of full
 * onboarding.
 */
export function selfieHasExpired(
  credentials: Credentials,
  now: number = Date.now(),
): boolean {
  return (
    credentials.selfie !== undefined && credentials.selfie.expiresAt <= now
  );
}
