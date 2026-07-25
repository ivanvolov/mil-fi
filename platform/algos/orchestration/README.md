# orchestration/

Assigns launchers to threats. One caller, one entry point: the **"Orchestrate all"** button under the left rail, backed by `allocate()` in `orchestration.ts`. Per-threat orchestration and scripted plan overrides were removed — everything runs through the bulk allocator now.

## What we optimize for

Greedy geometric weapon-target assignment. Two independent passes:

### Non-MFG pool (interceptor + MANPADS)

1. For each (threat, launcher) pair, keep the launcher as a candidate iff its `envelope.rangeKm` ≥ the minimum perpendicular distance from the launcher to either the threat's `futureCruise` polyline or `futureAttack` polyline.
2. Sort each threat's candidate list by `haversine(launcher.position, threat.position)` ascending — the literal "distance from launcher to target."
3. **Pass 1 (PRI):** iterate threats in code order; assign each threat the closest still-unassigned candidate.
4. **Pass 2+ (BKP, BKP-N):** repeat, excluding launchers already taken. Number of passes = `DEFAULT_REDUNDANCY` (currently 2) from `shared/schemas/defaults.ts`.

Result: each threat ends up with up to `k` distinct non-MFG launchers, no double-booking.

### MFG pool (mobile fire groups)

- Only considered against `futureAttack` — MFGs are short-ranged terminal weapons and shouldn't be matched to cruise overflights.
- Per (MFG, threat) pair, discretize the attack polyline in ~25 m steps, sum the arc-length inside the MFG's range ring, and divide by `threat.speedKmh` to convert to **dwell seconds**.
- Assign iff dwell ≥ `MFG_MIN_DWELL_SEC` (currently 3). No exclusivity — one MFG can support multiple threats and vice versa.

"Greedy" here means each step takes the locally best choice without backtracking. Fast and easy to explain to an operator, but it can be suboptimal: pass 1 might consume a launcher that would have been a much better fit for a later threat in the iteration order.

## Roadmap: weapon-target assignment with kill probability

The greedy allocator is intentionally simple. The classical formulation we'd ideally evolve toward is **Weapon-Target Assignment (WTA)** — a well-studied operations-research problem.

**1. Per-pairing kill probability** — assign each (launcher, threat) pair a `Pk ∈ [0, 1]` built from:
- *Range margin* — `rangeKm − closestKm` along the engageable leg. More headroom → higher Pk.
- *Time margin* — interceptor flight time to the intercept point vs. threat time-to-reach. Must be positive; bigger margin → more retry opportunity.
- *Engagement window* — seconds the threat is inside the launcher's ring (dwell — generalizing the MFG calculation).
- *Envelope fit* — altitude/speed within the type's envelope; penalties for edge cases.
- *Asset state* — ammo, reload, crew availability.

**2. Per-threat combined kill probability** — for a threat assigned launchers *1..n* with independent Pk_i, the combined kill probability is `1 − ∏(1 − Pk_i)`. Two launchers at Pk = 0.7 each → 0.91 combined; three → 0.97. The math naturally encodes "second shot helps a lot, third barely helps" — so the optimizer won't pile on.

**3. Per-threat value** — `value(threat) ∈ ℝ⁺` lets the operator prioritize: a Shahed aimed at a substation should outweigh one aimed at empty fields. Initially defaults to 1 for every intercept threat; becomes editable later.

**4. Global objective** — *maximize* `Σᵢ value(threatᵢ) · P(threatᵢ killed)` subject to:
- Each launcher engages at most one threat in the planning window (or its loadout capacity if we model salvos).
- Each threat receives at most *m* launchers (avoid wasteful overkill).
- Optional cost ceiling: subtract a $-weighted term for expensive interceptors.

**5. Solver** — WTA is NP-hard in general, but at this app's scale (≤ 20 threats × ≤ 20 launchers) it solves exactly with ILP in milliseconds, and a well-tuned greedy-marginal-gain heuristic ("at each step pick the (launcher, threat) pair whose assignment increases total expected destroyed value the most") usually lands within a few percent of optimal. Real systems tend to ship the heuristic because the Pk estimates themselves are fuzzy (±20-30%) — a precise optimum on imprecise inputs is a false sense of precision.

**Why this is worth the upgrade** — the current allocator answers "who's closest?" The Pk version answers "who actually kills it?" That's the question the operator is really asking.

## Files

- `orchestration.ts` — everything pure. Sections: types (`Role`, `Leg`, `Assignment`), `MFG_MIN_DWELL_SEC` constant, the internal `buildThreatPath` helper, the bulk allocator (`physicsIntercept`, `feasibleNonMfgFor`, `mfgRingTiming`, `timeToAttackStartSec`, `allocate`), and pricing (`priceUsdFor`, `formatUsd`). No React dependency.
