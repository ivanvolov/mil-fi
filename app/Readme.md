# MilFi World app

The World identity layer of MilFi: it binds a **real, unique human operator** to a defense unit so the unit's autonomous settlement agent is provably **human-backed**. It is *not* a login system — the platform keeps its invite-code auth; this app answers a different question: "is there an accountable human behind this agent's payout claims?"

## Decisions

- **Form factor:** plain web page using **IDKit** for v1. No World Mini App yet — neither target bounty requires one, and MiniKit adds mobile-testing overhead we can't afford mid-hackathon.
- **Auth role:** World verification is an **eligibility credential**, not a login. Verifying unlocks payout eligibility; it never replaces invite codes.

## Features — must have

- **Operator verification page** — IDKit widget requesting the **Selfie Check** credential (Orb-level Proof of Human also accepted). Dev-tested against the World simulator (https://simulator.orb.engineer).
- **Bind verification to unit** — store the nullifier hash ↔ operator/unit mapping. One human = one unit; a second unit claiming the same nullifier is rejected (Sybil resistance for the points economy).
- **Eligibility hook** — successful verification fires the Hedera-side effects: KYC grant on the `DEFPOINT` token account, and the unit's settle agent registered as human-backed via **AgentKit**.
- **Enforcement (negative path)** — the settlement service refuses payouts to any agent without valid human backing. This is the 30-second negative demo in the video: bot submits a claim → refused.

## Features — nice to have

- **Cohort risk tiers** — Orb-verified vs Selfie Check operators get different payout limits (also feeds World's requested beta feedback on cohort differences).
- **Re-verification / lapse** — periodic liveness re-check; a lapsed or disputed operator gets the unit's token account frozen until re-verified.

## Stretch

- Wrap the verification flow as a **World Mini App** (MiniKit) — only if time remains after the Hedera and 0G work.

## Non-goals

- Generic "Sign in with World ID" — an explicit bounty disqualifier ("not generic login").
- Mini App in v1.
- Storing any biometric or PII — we keep only the nullifier hash and verification level.

## Bounty note

Feeds **AgentKit New Use Cases** and **Selfie Check Beta** (see [docs/04-submission-checklist.md](../docs/04-submission-checklist.md)). Selfie Check full access opens only during the hackathon weekend. From the first integration attempt, log developer + user feedback into `docs/world-feedback.md` — the testing documentation is half the beta submission.
