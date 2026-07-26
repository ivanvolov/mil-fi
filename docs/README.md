# MilFi — docs

MilFi turns Ukraine's counter-UAV "points-for-kills" incentive system into an on-chain, agent-verified settlement network. Confirmed intercepts become instantly settled token payouts instead of a months-long paper trail.

## Reading order

- [01 — Story & problem](./01-story.md) — who we are, how the real-world system works today, and why it's broken
- [02 — Bounty texts](./02-bounty/) — raw bounty texts from the three sponsors (`hedera`, `0G`, `world`)
- [03 — Architecture & bounty map](./03-architecture-bounty-map.md) — **the primary plan**: the three human roles (World verification tiers), the two verification agents on 0G Compute, the Hedera settlement layer (HCS + HTS + settle agent), and which bounty each component closes
- [04 — Integration contract](./04-integration-contract.md) — the World ↔ Hedera/0G ↔ platform boundary: payout authorization, credential lookup, engagement verdicts
- [05 — Submission checklist](./05-submission-checklist.md) — event rules, per-sponsor requirements and disqualifiers, and the pre-submission checklist

## Repo map

- `platform/` — the working web application: air-defense orchestration for interceptors, threats, crews, and layers (React + Fastify + MongoDB), plus the settlement backend and Settlement Console. This is the operational tool our units already use; the hackathon work plugs into it.
- `app/` — World identity app: verification tiers (Selfie / Identity / Orb), AgentKit human-backing for agents, payout authorization.
- `verification/` — 0G Compute vision-inference harness for the verification agents (threat ID / kill confirm).
- `docs/` — this folder: vision, the primary plan, interfaces, bounty texts, and submission strategy.

## One-paragraph pitch

We are a private counter-UAV defense contractor in Ukraine. Critical facilities — power plants, government sites — hire us, with our crews, interceptor drones, and orchestration software, to defend them against Shahed-type attack drones. Ukraine's government rewards confirmed kills with e-points that units spend on a weapons marketplace — but confirmation and settlement take months. MilFi replaces that lag with an agentic pipeline: AI agents verify the kill from engagement imagery, publish tamper-proof evidence on-chain, and settle the reward in seconds as tokens on Hedera.
