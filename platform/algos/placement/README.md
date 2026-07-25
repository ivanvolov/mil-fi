# placement/

Plans Asset Manager layouts across three independent algos: MFG donut placement, non-MFG
launcher rings, and crew clusters. Split so each geometric objective can evolve without
stepping on the others; the coordinator (`AssetManagerDialog.tsx`) composes the three.

## Files

- `placement-common.ts` — shared geometry helpers used by every algo: bearing math, NPZ
  ray-casting (`pointInPolygon`, `isLatLngInAnyZone`), the angular/radial/spiral NPZ
  nudger (`findFreeSpot`), the legal-candidate grid builder (`buildLegalCandidates`), the
  universal min-separation post-pass (`enforceMinSeparation`). No optimizer logic — just
  primitives.

- `mfg-placement.ts` — **MFG donut**. MFGs cover the descent annulus `[R_p, R_p + descent]`
  around the protected disk. Greedy max-coverage: place the longest-range MFG first on the
  candidate cell whose range ring catches the most still-uncovered donut cells. Also exports
  `computeMfgHeatmap` for the diagnostic overlay.

- `launcher-placement.ts` — **non-MFG analytic rings**. Given `N` launchers and a redundancy
  target `k` (default 2), places launchers on one or two concentric rings around the
  factory so every azimuth is covered by ≥ k range circles. Two-ring mode fires when the
  fleet has a natural range gap (top range ≥ 1.3× bottom range): long-range → outer ring
  (`k = 1`, long reach); short-range → inner ring rotated to fill outer midpoints
  (`k = requested − 1`). Homogeneous fleets get one ring sized for full `k`.

- `crew-placement.ts` — **crew clusters**. Crew #0 sits at the protected-area center
  (primary-threads every non-MFG launcher so none can ever be flagged NO-CREW). Field
  crews #1..C-1 are placed by k-means over the non-MFG launcher positions and
  override-thread every launcher in their cluster (closer alternate operator).

## Ring geometry (launcher-placement)

For `M` launchers of range `r` evenly spaced 360°/M apart at ring radius `d`:

- Each launcher covers an azimuth wedge of half-angle `asin(r/d)` as seen from center
  (or all 360° if `d ≤ r`).
- Uniform k-fold coverage requires `d ≤ r / sin(kπ/M)` (when `kπ/M ≤ π/2`).
- When `k > M/2` the formula breaks — fall back to `d = r · cos(π/M)` (packs the launcher
  inside `r` so each covers every bearing → M-fold coverage, always ≥ requested k).

## Redundancy

`DEFAULT_REDUNDANCY` lives in `shared/schemas/defaults.ts` and is consumed by both
`planLauncherPlacement` (per-ring k-coverage target) and the orchestration algo's
`allocate` (number of PRI/BKP passes). Keeping them coupled ensures the fleet layout and
the intercept plan agree on how many launchers cover each threat.

## No-placement zones

Honored strictly for everything except the central control crew (crew #0 at factory). Field
crews inherit their positions from the launcher clusters, which the launcher placer already
legalizes via `findFreeSpot` (angular sweep first, then radial along bearing, then spiral).
Central crew stays at the factory regardless.

## Universal min separation

No pair of launchers (MFG↔MFG, MFG↔non-MFG, non-MFG↔non-MFG) can share ground closer than
`MIN_SEPARATION_KM` (currently 0.5 km). Each algo runs the post-pass on its own launchers;
cross-algo separation is currently trusted to the geometry (MFGs live on the donut, launchers
on rings outside the disk — natural separation).
