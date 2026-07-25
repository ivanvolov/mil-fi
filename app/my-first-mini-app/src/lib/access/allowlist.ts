/**
 * Nationality allow-list: NATO member states + Ukraine.
 *
 * Allow-list, not block-list — anything not named here is denied by default, so
 * a country nobody thought about does not quietly get access.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS LIST IS PUBLIC, AND WHY THAT IS FINE
 *
 * World ID's Identity Check does not answer "what nationality is this user?".
 * It answers "does this user's nationality equal the value you supplied?" —
 * `IdentityAttribute` carries a `value` you assert against, and the response is
 * a single `identity_attested` boolean.
 *
 * There is no OR across attribute values (`any`/`all` compose credential
 * requests, not attribute values), so we cannot ask "is nationality any of these
 * 33?" in one request. Asking 33 times would mean 33 scans.
 *
 * So the flow is: the user declares their nationality from this list, and
 * Identity Check proves or disproves the declaration. The declaration is
 * untrusted input; the attestation is the verification. Someone holding a
 * Russian passport who selects "France" gets `identity_attested: false` and is
 * denied — they cannot talk their way in.
 *
 * That makes the list itself visible in the UI, which is deliberate. A hidden
 * list would invite probing to discover it; a published one has nothing to
 * discover. NATO membership is public knowledge regardless.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Codes are ISO 3166-1 alpha-3, matching what Identity Check expects for
 * `nationality` and `issuing_country`.
 */

export interface AllowedNation {
  /** ISO 3166-1 alpha-3 */
  code: string;
  /** Display name for the declaration dropdown. */
  name: string;
}

/** NATO's 32 members (including Finland, 2023, and Sweden, 2024) plus Ukraine. */
export const ALLOWED_NATIONS: readonly AllowedNation[] = [
  { code: 'ALB', name: 'Albania' },
  { code: 'BEL', name: 'Belgium' },
  { code: 'BGR', name: 'Bulgaria' },
  { code: 'CAN', name: 'Canada' },
  { code: 'HRV', name: 'Croatia' },
  { code: 'CZE', name: 'Czechia' },
  { code: 'DNK', name: 'Denmark' },
  { code: 'EST', name: 'Estonia' },
  { code: 'FIN', name: 'Finland' },
  { code: 'FRA', name: 'France' },
  { code: 'DEU', name: 'Germany' },
  { code: 'GRC', name: 'Greece' },
  { code: 'HUN', name: 'Hungary' },
  { code: 'ISL', name: 'Iceland' },
  { code: 'ITA', name: 'Italy' },
  { code: 'LVA', name: 'Latvia' },
  { code: 'LTU', name: 'Lithuania' },
  { code: 'LUX', name: 'Luxembourg' },
  { code: 'MNE', name: 'Montenegro' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'MKD', name: 'North Macedonia' },
  { code: 'NOR', name: 'Norway' },
  { code: 'POL', name: 'Poland' },
  { code: 'PRT', name: 'Portugal' },
  { code: 'ROU', name: 'Romania' },
  { code: 'SVK', name: 'Slovakia' },
  { code: 'SVN', name: 'Slovenia' },
  { code: 'ESP', name: 'Spain' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'TUR', name: 'Türkiye' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'USA', name: 'United States' },
  { code: 'UKR', name: 'Ukraine' },
] as const;

const ALLOWED_CODES: ReadonlySet<string> = new Set(
  ALLOWED_NATIONS.map((nation) => nation.code),
);

/**
 * Whether a declared nationality code is permitted.
 *
 * Call this on the SERVER before issuing an Identity Check request. A client
 * that submits an arbitrary code must not be able to have it attested and
 * counted — the allow-list check and the attestation are two separate controls
 * and both have to pass.
 */
export function isAllowedNation(code: string): boolean {
  return ALLOWED_CODES.has(code.toUpperCase());
}

export function nationName(code: string): string | undefined {
  return ALLOWED_NATIONS.find(
    (nation) => nation.code === code.toUpperCase(),
  )?.name;
}
