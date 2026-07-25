# 02 — Architecture

## System at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│  PLATFORM (existing, platform/)                                     │
│  React + Fastify + MongoDB — orchestration of interceptors,         │
│  threats, crews, layers. Operators manage defense in real time.     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ engagement event (imagery + metadata)
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VERIFICATION AGENTS (0G Compute — TEE-sealed — + local LLMs)       │
│  Agent A — threat ID: visual-spectrum image → "is this a threat?"   │
│  Agent B — kill confirm: thermal/IR image → "was it destroyed?"     │
│  Encrypted imagery/memory on 0G Storage · agents minted as          │
│  Agentic IDs · signed verdicts + image hashes → backend service     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ verdicts agree (N-of-M)
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SETTLEMENT (Hedera)                                                │
│  HCS topic  — immutable evidence log per engagement                 │
│  HTS token  — e-points minted/transferred to the unit's account     │
│  Scheduled  — recurring contractor fees / batched state settlement  │
└───────────────┬─────────────────────────────────────────────────────┘
                │ balance / audit links
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  IDENTITY (World, app/)                                             │
│  AgentKit: settle/unit agents prove they act on behalf of a real,   │
│  unique human operator — payouts only to human-backed agents.       │
│  Selfie Check for low-friction field-operator onboarding.           │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Platform (exists today)

The `platform/` app is our real operational tool: layered scenarios on a live map, interceptor/threat/crew CRUD with optimistic concurrency, envelope modeling, threat-path prediction, and orchestration algorithms (`algos/`) that assign interceptors to threats.

For the hackathon it gains:

- An **engagement record**: when an interceptor engages a threat, the platform captures the event — threat ID, interceptor ID, unit, timestamp, and two images (visual capture at engagement, thermal/IR capture after).
- A **ledger panel**: per-unit token balances, engagement status (pending → verified → settled), and deep links to HashScan / the HCS topic for every piece of evidence.

### 2. Agentic verification pipeline

Two-stage image analysis, mirroring how manual confirmation actually works (identify the threat, then confirm the kill):

- **Agent A — threat identification.** Input: visual-spectrum image from the engagement. Task: classify the object (Shahed-class / other UAV / not a threat), with bounding box and confidence. A false positive here is the expensive failure mode — this is the "was it actually a threat" question the state currently spends months on.
- **Agent B — kill confirmation.** Input: thermal/IR image taken after the intercept. Task: confirm destruction (debris heat signature, detonation signature) and consistency with Agent A's detection (location, time window). Thermal is the second, independent modality — much harder to fake than a single visual frame.

Execution:

- **0G Compute / Private Computer** hosts the inference — TEE-sealed, so it is private and verifiable by default. This matters twice over: the verdict is produced outside the control of the party who profits from the payout, and the TEE attestation is itself submittable evidence. (0G's product bounty explicitly requires *proof* that inference runs on 0G Compute — keep the attestation artifacts.)
- **0G Storage** holds the engagement imagery and each agent's evolving memory, encrypted — raw kill footage is sensitive military data and cannot sit on a public CDN, but its hashes must still anchor the on-chain evidence trail.
- **Agentic IDs** — Agents A and B are minted as Agentic IDs on 0G Chain, giving each verifier an on-chain identity that verdicts reference (mirrors HCS-14 on the Hedera side).
- **Local LLM/VLM fallback** (e.g. quantized vision models on field hardware) keeps the pipeline alive under jamming / no-uplink conditions; verdicts sync and settle when connectivity returns.
- Each agent emits a **signed verdict**: `{engagementId, imageHash, classification, confidence, model, timestamp, signature}`.
- Settlement requires **agreement** (both stages pass; optionally N-of-M replicated runs for the demo). Disagreement or low confidence routes the engagement to a human review queue — the system degrades to today's process, never below it.

### 3. Backend settlement service

A small microservice (Node/TS, lives alongside `platform/server/`) that is the only component holding Hedera keys:

- Receives verdicts, validates signatures and agreement policy.
- Publishes every evidence artifact (image hashes, verdicts, attribution) to the engagement's **HCS topic**.
- On confirmation, executes the **HTS transfer** of e-points from the treasury/escrow account to the unit's account.
- Exposes read APIs the platform's ledger panel consumes (balances via Mirror Node, engagement status).

### 4. Hedera settlement layer

Detailed in [03 — Hedera integration](./03-hedera-integration.md). Summary:

- **HTS** fungible token = e-points. Native token ops, no smart contract needed. Treasury holds supply; confirmed kills trigger transfers; marketplace redemptions transfer back (or burn).
- **HCS** = the evidence chain. One topic per engagement (or one global topic with engagement-keyed messages): detection event, image hashes, agent verdicts, settlement receipt. Anyone — the state, the facility, an auditor — can replay the full trail with consensus timestamps.
- **Scheduled Transactions** = the contractor economics: recurring protection fees from facilities, and time-locked/batched settlement mirroring the state's reconciliation cycle.

### 5. Identity — World (AgentKit + Selfie Check)

The `app/` application handles the human-accountability layer, and the framing matters: this is not "log in with World ID." The autonomous agents are the actors here, and the question the system must answer is **"is this agent backed by a real, unique human — or is it a bot farming the points economy?"** That is exactly World's **AgentKit** model:

- Each unit runs a **settle/claims agent** that acts on the unit's behalf (submits engagement evidence, receives payouts). Via AgentKit, that agent carries proof it is operated by a real, unique, World ID-verified human operator.
- The **settlement service refuses execution rights to non-human-backed agents**: no valid human backing → no HTS payout, no KYC grant on the DEFPOINT token. Human-backing is the authorization primitive, not a cosmetic badge.
- **Selfie Check** covers field reality: crews at a power plant in a war zone don't have Orb access. Selfie Check gives a low-friction liveness credential for operator onboarding, upgradeable to Orb-grade Proof of Human later. The two cohorts (Orb-verified vs Selfie Check) can carry different payout limits — a natural risk tier.
- Sybil resistance is economically load-bearing: one human cannot masquerade as many units to multiply kill claims, and a captured/compromised agent without live human backing gets frozen (HTS `freezeKey`).

## Trust model (honest version)

- **What's trustless:** the evidence log (HCS — nobody can backdate or rewrite it), the settlement (HTS — the transfer happened or it didn't), the agent verdicts' *integrity* (hashes + signatures on-chain).
- **What's trusted:** image provenance at capture time (a camera can be pointed at a screen), and the agreement policy service. Mitigations: two independent modalities (visual + thermal), 0G-hosted inference outside the beneficiary's control, World ID-bound operators, and the human review queue for low-confidence cases. Full capture-time attestation (secure enclaves on the drone) is future work, and the on-chain evidence trail is exactly what makes retroactive fraud prosecution possible in the meantime.

## Hackathon vertical slice

What we actually demo:

1. Operator onboards: Selfie Check / World ID verification binds them to the unit's agent (AgentKit) and triggers the KYC grant on their Hedera account.
2. A simulated threat enters a layer; interceptor engages; platform emits the engagement record with two images.
3. Agents A and B run on 0G Compute (local model as fallback), verdicts stream in with TEE attestation.
4. Evidence + verdicts land on the HCS topic (visible on HashScan live).
5. The settle agent — human-backed, per AgentKit — executes the HTS transfer; e-points hit the unit's account seconds later and the ledger panel updates.
6. Unit spends points on a mock marketplace item — token transfer back to treasury.
7. Negative demo (30s, high judge value): a non-human-backed bot submits the same claim → settlement refused; a disputed engagement → account frozen.

Each numbered step is deliberately a bounty artifact: 1 is the World submission, 3 the 0G submission, 4–6 the Hedera submission — one pipeline, three tracks. See [04 — Submission checklist](./04-submission-checklist.md).
