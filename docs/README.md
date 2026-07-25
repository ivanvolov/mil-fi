# MilFi — docs

MilFi turns Ukraine's counter-UAV "points-for-kills" incentive system into an on-chain, agent-verified settlement network. Confirmed intercepts become instantly settled token payouts instead of a months-long paper trail.

## Reading order

- [01 — Story & problem](./01-story.md) — who we are, how the real-world system works today, and why it's broken
- [02 — Architecture](./02-architecture.md) — the hackathon build: the platform, the agentic verification pipeline (0G Compute + local LLMs), World AgentKit identity, and Hedera settlement
- [03 — Hedera integration](./03-hedera-integration.md) — which Hedera services we use, how they map to the hackathon challenges, and the concrete payment flow
- [04 — Submission checklist](./04-submission-checklist.md) — bounty targets across Hedera / 0G / World, per-sponsor requirements and disqualifiers, and when to run the eligibility-check skill

Raw bounty texts (Hedera, 0G, World) are in [`../bounty/`](../bounty/).

## Repo map

- `platform/` — the working web application: air-defense orchestration for interceptors, threats, crews, and layers (React + Fastify + MongoDB). This is the operational tool our units already use; the hackathon work plugs into it.
- `app/` — World identity app: AgentKit human-backing for the settlement agents + Selfie Check operator onboarding.
- `bounty/` — raw bounty texts from the three sponsors (Hedera, 0G, World).
- `docs/` — this folder: vision and hackathon design docs.

## One-paragraph pitch

We are a private counter-UAV defense contractor in Ukraine. Critical facilities — power plants, government sites — hire us, with our crews, interceptor drones, and orchestration software, to defend them against Shahed-type attack drones. Ukraine's government rewards confirmed kills with e-points that units spend on a weapons marketplace — but confirmation and settlement take months. MilFi replaces that lag with an agentic pipeline: AI agents verify the kill from engagement imagery (visual + thermal), publish tamper-proof evidence on-chain, and settle the reward in seconds as tokens on Hedera.
