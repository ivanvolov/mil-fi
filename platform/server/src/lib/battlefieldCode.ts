/** Battlefield-wide code: generated once on creation, kept unique, never user-edited.
 *  8 digits — shown read-only in the info panel for launchers, crews and threats.
 *  Falls back to a generated value whenever the caller doesn't supply one. */
export function generateBattlefieldCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 10);
  return s;
}
