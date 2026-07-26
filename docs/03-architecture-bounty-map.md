# 03 — Architecture & bounty map

How the system is built, and which sponsor track each component addresses. Submission
mechanics (video, form, repo) live in [05 — Submission checklist](./05-submission-checklist.md).

---

## Roles: three verification tiers (World)

Three types of people operate the system, each with an identity-assurance level matched to
their role. This is not "login with World" — the verification tier determines what a person is
allowed to do and how much money can be trusted to flow through them.

**Level 1 — Government (Orb verification, highest biometric assurance).**
Program administrators. They set the payout policy the settle-agent enforces: confidence
thresholds ("pay from 95%"), per-target-class tariffs, and the right to freeze disputed
payouts. Orb, because these are the people who control program money — maximum assurance.

**Level 2 — Spotters (Selfie Check, selfie liveness without an Orb).**
Civilians who see an incoming threat and report it: photo + coordinates + time. Selfie Check,
because an Orb is not accessible in a frontline city, but bots flooding the system with fake
reports must be kept out. Their report is the entry point of the whole funnel.

**Level 3 — Military units (document-backed verification).**
The crews that intercept. They receive the payouts, so they need the highest accountability
available without an Orb: a document-backed credential. World's document credential attests
"the document is real"; a nationality/jurisdiction attestation via Identity Check is the
designed follow-up. We do not check against a military registry — for the demo, document +
jurisdiction is a proxy for "military unit of Ukraine". This is recorded openly as a
limitation. *(Implementation status: the passport credential flow is wired; the separate
Identity Check nationality attestation is future work.)*

**How this connects to money.** Each unit is represented by a software claim-agent (files
claims, receives payouts). Through World AgentKit, the agent carries proof that "a real,
unique, verified human stands behind me". The settle-agent (see the Hedera section) verifies
that proof before any payout. No human behind the agent → no payout. Multiple agent wallets
registered by the same human all resolve to the same `humanId` in AgentBook, so one person
cannot impersonate ten units to multiply claims.

**World tracks this addresses:**
- *AgentKit New Use Cases* — AgentKit verifies human-backing, and the outcome changes the most
  consequential thing in the system: whether money moves. Autonomous payout authorization in a
  defense-contracting economy is the new workflow and trust model this track asks for.
- *Selfie Check Beta* — Selfie Check is a real eligibility signal (the right to submit threat
  reports), not a generic login. The required testing documentation — developer feedback and
  user feedback — lives in [`world-feedback.md`](./world-feedback.md).
- *Identity Check* — the document tier explains why the attribute is needed (payout
  accountability) and minimizes data collection: we never store the document, only
  "verified / not verified + jurisdiction allowed".

---

## One engagement, step by step

**Step 1. Threat report.** A spotter (level 2) submits: a photo of the object in the sky +
coordinates + time. It lands in the platform (`platform/` — the coordination map with
interceptors and threats; it is the stage and UI of the system).

**Step 2. Agent A — "is this a threat at all?"** The first AI agent takes the report photo and
answers in strict JSON: threat or not, class (Shahed / other UAV / aircraft / not a threat),
what is visible, confidence 0..1, one-sentence reasoning. This is the question that currently
costs the state months of manual review. It runs today: `qwen2.5-omni` on 0G Compute; the test
fixtures produce correct verdicts (retriever → not a threat, Shahed in flight → threat,
wreckage → shahed_class).

**Step 3. Interception.** A unit (level 3) engages the target. The platform records the
engagement: who, with what, when, against which threat.

**Step 4. Agent B — "was the target destroyed?"** The second AI agent takes the post-strike
photo — same coordinates, ideally thermal — and answers: the target is no longer airborne /
here is the wreckage / a detonation signature is present, and whether this is consistent with
what Agent A saw (location, time window). Two independent agents on two different captures are
harder to fake than a single frame.

**Open problem (recorded honestly, not hidden):** we do not cryptographically prove that a
photo was taken at that place and time — a camera can be pointed at a screen. Mitigations:
(a) two independent modalities; (b) inference runs on 0G, outside the control of the party who
gets paid; (c) disputed and low-confidence cases go to a manual adjudication queue (the unit's
account is frozen meanwhile); (d) the immutable Hedera trail makes retroactive audit and
sanction possible. Full camera attestation (secure enclave on an observer drone) is future
work.

**Step 5. Every artifact goes to the Hedera journal.** Each artifact of steps 1–4 (photo
hashes, both verdicts including failed attempts and retries, which agent said what) is
published to HCS — a log with consensus timestamps. Details in the Hedera section.

**Step 6. Decision and payout.** The settle-agent reads the journal, applies the
government-set rule ("A said threat at ≥95% AND B confirmed destruction → pay the tariff"),
verifies the unit agent's human-backing — and transfers tokens to the unit's account itself.
Seconds instead of months.

**Step 7. Spending.** The unit spends its points on the marketplace (transfer back to
treasury).

**Step 8. Negative scenarios (required for the World track).** A bot with no human behind it
submits the same claim → refusal. A disputed downing → the unit's account is frozen until
adjudication (Government console: release payout / deny claim).

**Agents being paid for work.** The settlement layer has a natural slot for the settle-agent
to pay Agents A and B a micropayment per verified image (the x402 standard over Hedera),
turning verification into an agent-to-agent service market. Not implemented — future work.

---

## 0G: what it does here and how the track requirements are met

**What 0G does in this system.** 0G is the compute layer for the AI models. Both vision agents
(A and B) are calls to models hosted on 0G Compute — not OpenAI, not local. The substantive
reason for 0G: inference can execute inside a TEE (a hardware enclave), meaning the verdict is
produced in an environment controlled neither by us nor by the party receiving the money, with
cryptographic backing for that claim.

**Proof of 0G Compute inference.** Every request to the router returns a request id plus 0G's
own `x_0g_trace` object (request id, provider address, billing); the console Activity page
shows the account's consumption. Captured artifacts: raw JSON responses with request ids in
the README, and the console screenshot in [`evidence/0g-activity-console.png`](./evidence/0g-activity-console.png)
whose provider address matches the trace objects in the responses.

**TEE trust mode.** API keys on 0G carry a trust mode (Standard / Verified / Private). The
inference key used by the platform is a **Private (TEE)** key, wired as the priority key in
`platform/server/src/config.ts` — so "TEE-sealed inference" describes the actual runs, not an
aspiration.

**Contract deployment addresses.** No contracts are deployed by design: the whole project is
smart-contract-free (see the Hedera "No Solidity" constraint, which applies repo-wide). The
on-chain audit trail lives on Hedera (HTS token `0.0.9753000`, HCS topic `0.0.9753001`).
Minting Agentic IDs for Agents A and B (0G's on-chain agent identity NFT) is an optional
future addition, relevant only for Agentic-ID-based projects.

**Privacy and verifiability at the same time.** Normally one chooses: either the data is
secret (then nobody can verify a downing was real) or everything is public and verifiable
(then sensitive military data leaks). Here both hold, because three things are separated:

- *Raw imagery* (drone frames, strike photos) is never public — it stays in our database, not
  on a CDN, not on a blockchain.
- *Processing* happens inside the TEE enclave on 0G. Nobody sees the image — including us and
  the 0G operator. It is not stored there; it goes in, is processed, and only a text verdict
  comes out.
- *On-chain (Hedera HCS)* goes only the image hash + the verdict. A hash is a one-way
  fingerprint from which the image cannot be reconstructed. Any auditor on HashScan sees
  "verdict Shahed 0.97, photo hash so-and-so", can verify nothing was backdated — and never
  gains access to a single pixel.

**Track: Best AI Product** — an end-user product (not tooling), with inference demonstrably on
0G Compute and proof artifacts included.

---

## Hedera: what it does here and how the track requirements are met

**Two native services plus Mirror Node, zero smart contracts.**

**HCS (Consensus Service) — the evidence journal.** Not a contract: a "submit a message, get a
consensus timestamp" service. The settlement service writes each engagement's records in
order: engagement opened → report photo hash → Agent A verdict → post-strike photo hash →
Agent B verdict → payout receipt. The network sets the timestamps, so nothing can be rewritten
or inserted after the fact — exactly the "nobody drew up a downing with yesterday's date"
guarantee the paper process lacks. Any auditor can replay the whole history on HashScan or via
the public Mirror Node REST API.

**HTS (Token Service) — the money itself.** The DEFPOINT token = e-points. Also without a
contract: token creation, transfers, and three protocol-level management keys — `kycKey`
(only World-verified accounts can receive the token), `freezeKey` (freeze a unit's account
during a dispute), `pauseKey` (emergency stop of the whole program). Compliance that other
chains implement in contracts is a set of flags at token creation here.

**The settle-agent — the agent that watches and pays.** Implemented directly on the Hedera
JavaScript SDK (`@hashgraph/sdk`). It runs per engagement: when an engagement completes, it
reads the evidence via Mirror Node, applies the government-level rule ("A: threat ≥95%, B:
destruction confirmed → transfer N DEFPOINT by tariff"), verifies human-backing (World
AgentKit authorization), and executes the treasury → unit transfer itself — no human approves
the transfer. The moment an AI agent autonomously moves value is the core of the track.

**Wallets.** Each unit has its own Hedera account, created automatically at onboarding, with a
KYC grant attached after World verification. For the demo the settlement service custodies
unit keys; a custodial provider or unit-held keys is the production path.

**Scheduled Transactions.** Designed for the contractor economy (a protected facility paying
weekly, executed natively by the network without cron bots) — not implemented in the hackathon
build; future work.

**Hedera tracks this addresses:**
- *AI & Agentic Payments* — an AI agent executes token operations on Testnet autonomously,
  using the Hedera SDK; the README documents the payment flow with HashScan links. The token's
  KYC/freeze controls and the HCS audit trail are implemented; HCS-14 agent IDs and x402
  micropayments are future work.
- *No Solidity Allowed* — the same build qualifies by construction: SDK-only, three native
  services in active use (HTS + HCS + Mirror Node), and zero `.sol` files anywhere in the
  repository. This constraint applies to the whole project, including the 0G side.

---

## Summary: component → function → track

- Three verification tiers + AgentKit binding of agents to humans (`app/`) → World: AgentKit +
  Selfie Check Beta (+ Identity Check as the designed document tier)
- Agent A (threat?) and Agent B (destroyed?) on 0G Compute (`verification/`,
  `platform/server/src/verification/`) → 0G: Best AI Product
- HCS evidence journal + DEFPOINT token + settle-agent (`platform/server/src/hedera/`) →
  Hedera: AI & Agentic Payments + No Solidity Allowed
- Platform (map, Settlement and Government consoles) → the stage and the live demo link
- Negative scenarios (bot → refusal; dispute → freeze + adjudication) → required World demo
  moment, and the clearest illustration that the human-backing check genuinely gates money

## Submission slots

Event rule: at most 3 partner prizes on the form; multiple tracks of the same partner count as
one. Submitted: **Hedera** (AI & Agentic Payments + No Solidity Allowed), **0G** (Best AI
Product), **World** (AgentKit New Use Cases + Selfie Check Beta).
