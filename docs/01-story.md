# 01 — Story & problem

## Who we are

We operate a **private counter-UAV (c-UAV) defense company in Ukraine**. We are contractors: large electrical plants, energy infrastructure, and government facilities hire us — together with our partnered military units, our interceptor drones, and our orchestration technology — to protect their sites against Shahed-type loitering munitions and other hostile UAVs.

Our operational tool already exists: the **platform** in this repo (`platform/`) is the coordination layer we use to place interceptor assets, assign crews, model threat corridors, and orchestrate engagements in real time on a live map.

## How the incentive system works today

Ukraine runs a government-backed reward system for air defense and strike units — conceptually an **electronic points economy** (the "e-points" system, in the spirit of the Army of Drones bonus program and the Brave1 marketplace):

1. A unit engages and destroys a hostile threat (e.g. a Shahed).
2. The kill must be **confirmed**: evidence is collected, reviewed, and attributed — proof that the threat was real, that it was destroyed, and that *this specific unit* destroyed it.
3. Once confirmed, the unit is credited **points**.
4. Points are spendable on a **state-sanctioned marketplace** that sells drones, equipment, and weapons systems. Points are effectively money with a restricted spend graph.

It sounds surreal, but this is genuinely how the system works today — a gamified, state-run kill-to-equipment economy. And it works: it routes resources directly to the units that perform.

## The problem

The system's weakness is **settlement latency and trust bottlenecks**:

- **Confirmation takes months.** Evidence review is manual. Someone has to verify that the object destroyed was a real threat, and that attribution (which unit, which system, which engagement) is correct.
- **Payment takes more months.** After confirmation, the points credit and the procurement cycle add further delay.
- **The evidence chain is opaque.** Photos, videos, and radar logs pass through hands and inboxes. There is no tamper-proof, independently auditable trail from "engagement happened" to "points paid."
- **For contractors like us it's worse.** As a private company working alongside military units, our attribution and billing sit on top of the same slow pipeline. A facility pays us for protection; our units earn points through the state system; nothing settles at the speed the operations actually happen.

A unit that destroyed a threat tonight might re-equip from that kill **next quarter**. In a war of attrition against cheap, massed drones, that lag is an operational cost, not just an accounting inconvenience.

## The idea

Move verification and settlement to rails that operate at machine speed:

- **Agentic verification** replaces the months of manual review. AI agents analyze engagement imagery — a visual-spectrum capture for threat identification and a second thermal/IR capture for kill confirmation — and produce signed verdicts. Verification compute runs on **0G** (decentralized AI compute) with **local LLM/VLM** fallbacks, so the pipeline works in degraded, bandwidth-poor field conditions and the verdicts are independently reproducible.
- **A tamper-proof evidence chain** replaces the paper trail. Every engagement event — detection, imagery hashes, agent verdicts, attribution — is published to an immutable, timestamped public log.
- **Instant token settlement** replaces the months of payment lag. Confirmed kills mint/transfer points as tokens on **Hedera** to the unit's account in seconds, with sub-cent fees. The marketplace redemption becomes a token operation.
- **Human accountability stays in the loop.** Operators are verified humans via **World ID** — a unique-human proof bound to each operator account — so autonomous settlement never detaches from a real, accountable person behind each unit.

The hackathon scope deliberately narrows this to a working vertical slice — see [02 — Architecture](./02-architecture.md).

## Why this matters beyond Ukraine

Every future conflict and every critical-infrastructure operator will face cheap massed drones. Incentive-driven, contractor-augmented air defense is already reality; what's missing is settlement infrastructure that matches the tempo of the threat. A verifiable kill-to-payment pipeline — evidence on a public ledger, agents doing the verification, tokens doing the settlement — is that infrastructure.
