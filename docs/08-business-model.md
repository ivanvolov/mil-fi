# 08 — Business model & roadmap

## The opportunity

Ukraine's e-points economy (see [01 — Story](./01-story.md)) already runs a
kill-confirmation-to-marketplace-redemption pipeline, on the order of **₴150 billion
(~$3.3B USD) a year** in weapons, equipment, and drones moving through it. That number is the ceiling
MilFi is built against — not a market we have to create, a market we have to plug into.

The Ministry of Defense is actively restructuring how military units are funded, with unit
autonomy — some units projected to control up to **80% of their own procurement budget**
directly, rather than routing everything through central state channels. That shift is the
opening: a settlement rail a unit can adopt on its own, without waiting for a top-down state
integration, is worth far more the moment units hold their own budgets.

## Business model

**Infrastructure first, adoption second.** MilFi doesn't sell to the state on day one — it
sells the pattern: a unit or brigade adopts the settlement layer internally (rewards,
recognition, points for confirmed kills — assets they already control), on our
infrastructure, at zero integration cost to the state. This mirrors exactly how our
counter-UAV company already sells protection services to facilities: infrastructure they
plug into, not a program they have to build.

**Revenue paths, in order of realism:**

1. **Infrastructure fee** on our own operations first — settlement is a feature of the
   coordination platform we already sell to protected facilities.
2. **Per-unit or per-brigade licensing** once a unit adopts the system for its own internal
   points/reward economy, independent of state approval.
3. **A cut of settled volume** once units control their own procurement budgets under the
   MoD restructuring — the moment a unit can decide where its 80% goes, being the
   already-integrated settlement rail is the entire business.
4. **State-level integration**, longer-term — MilFi becomes the settlement backend for the
   national e-points system itself, at the scale of the ₴150B (~$3.3B USD) marketplace.

## Roadmap

- **Now → next 2 months: one brigade pilot.** Approach one partnered military brigade to
  run the system internally for rewards, medals, and recognition on confirmed engagements —
  no state approval required, since it's the brigade's own internal recognition economy.
  This is the validation milestone in [07 — Validation](./07-validation.md).
- **3–6 months: expand within our own operational network.** Roll the settlement layer out
  across the facilities and units we already work with, using the pilot brigade as the
  reference deployment.
- **6–12 months: unit-controlled budget integration.** As the MoD restructuring hands units
  direct control of procurement spend, position MilFi as the rail units use to settle and
  spend that budget — points backed by real HTS balances, redeemable against the same
  marketplace infrastructure.
- **12+ months: state-level settlement backend.** Pursue integration with the national
  e-points/marketplace system, at which point MilFi is the settlement layer for the ₴150B
  (~$3.3B USD) flow described above, not just a slice of it.
- **Ongoing, technical:** the items already flagged as future work in
  [03 — Architecture & bounty map](./03-architecture-bounty-map.md) — Scheduled
  Transactions for recurring facility billing, x402 micropayments to Agents A/B, HCS-14
  agent identity, unit-held keys replacing custodial demo keys, and camera/imagery
  attestation to harden the evidence chain.
