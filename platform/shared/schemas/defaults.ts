/** Operational defaults shared between placement (how many launchers cover each azimuth)
 *  and orchestration (how many launchers are assigned per threat). Keeping them in one
 *  place ensures the layout produced by Manage Assets and the assignments produced by
 *  Orchestrate agree on what "redundancy" means. */
export const DEFAULT_REDUNDANCY = 2;
