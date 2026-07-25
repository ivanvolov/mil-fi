# 03 — Hedera integration

## Which challenge we target

**Primary: 🤖 AI & Agentic Payments on Hedera ($6,000).** This is the strongest fit — our core loop *is* the bounty's thesis: AI agents that verify real-world events and move value autonomously, at machine speed, where today's settlement takes months. We're not inventing an agent economy for the demo; we're porting an existing, state-run points economy onto agentic rails. That's the "real payment flows between agents and services" the judges ask for.

**Simultaneous qualification: 🛠️ "No Solidity Allowed" ($1,000 × 3 teams).** Our design uses zero Solidity by construction — HTS + HCS + Scheduled Transactions via `@hashgraph/sdk`. That's ≥2 native services plus Mirror Node integration, which is this track's entire qualification list. One build, two tracks.

**Considered and deprioritized: 🪙 Tokenization ($1,500).** E-points are arguably a real-world asset (a claim on state marketplace equipment), and compliance controls (KYC = World ID gate, freeze on disputed engagements) map well — but the agentic track pays 2× more and fits the story better. We keep the compliance features anyway (see below) since they cost little and strengthen both submissions.

**Skip: Cross-Chain Automation Hub / Continuity.** Axelar GMP adds a second chain for no narrative gain; Continuity track has eligibility restrictions.

## Why Hedera fits this use case (say this in the demo)

- **Sub-second finality, sub-cent fixed fees** — settlement per intercept event, even under mass-raid volumes (dozens of engagements/night), costs effectively nothing and confirms before the debris hits the ground.
- **Native token service** — the e-points economy needs mint/transfer/freeze/KYC, not DeFi composability. HTS gives protocol-level compliance controls without a single line of contract code to audit.
- **HCS ordered, timestamped consensus** — an evidence chain is literally what HCS is for. Consensus timestamps are the anti-backdating guarantee the manual process lacks.
- **Scheduled Transactions** — the contractor business layer (recurring facility fees, time-locked settlements) is a native primitive, no keeper bots.

## Concrete build

### Hedera resources (all on Testnet)

- **`DEFPOINT`** — HTS fungible token (0 decimals, like the real e-points). Treasury = settlement service account. Enable `kycKey` (World ID-verified operators get KYC-granted), `freezeKey` (freeze a unit's account while an engagement is disputed), and `pauseKey`.
- **Unit accounts** — one Hedera account per unit/crew, auto-created and KYC-granted on operator onboarding.
- **Evidence topics** — one HCS topic per engagement (created at engagement time), plus one global `engagements-index` topic. Message sequence per engagement: `ENGAGEMENT_OPENED` → `IMAGE_HASH(visual)` → `VERDICT(agent-A)` → `IMAGE_HASH(thermal)` → `VERDICT(agent-B)` → `SETTLEMENT(txId, amount)`.
- **Scheduled transactions** — (a) weekly facility-fee transfer HBAR → contractor account; (b) optional time-locked settlement variant: schedule the DEFPOINT transfer at verdict time, execute when the counter-signature (state-side key in a real deployment, second demo key here) lands.

### Code layout

```
platform/server/src/hedera/
├─ client.ts          # @hashgraph/sdk client, testnet, operator key from .env
├─ token.ts           # DEFPOINT create / kyc-grant / transfer / freeze
├─ topics.ts          # HCS topic create / submit / mirror-node read
├─ schedule.ts        # scheduled tx create + sign
└─ routes.ts          # /api/v1/hedera/* consumed by the ledger panel

agents/               # new top-level dir
├─ verify-threat/     # Agent A — visual classification (0G endpoint or local VLM)
├─ verify-kill/       # Agent B — thermal confirmation
└─ settle/            # Hedera Agent Kit agent: reads verdicts, submits HCS
                      # messages, executes the HTS transfer autonomously
```

Use the **Hedera Agent Kit (JS/TS)** for the `settle` agent — the bounty explicitly rewards it, and it gives the agent natural-language tool-calling over HTS/HCS out of the box. Use raw `@hashgraph/sdk` in `hedera/` for the deterministic service paths. Mirror Node REST for balances and topic reads in the UI (extra points on the SDK track).

### The payment flow (what the demo video shows)

1. Engagement fires in the platform → `POST /api/v1/hedera/engagements` → HCS topic created, `ENGAGEMENT_OPENED` published.
2. Agent A verdict (threat: Shahed, 0.97) → hash + verdict published to topic.
3. Agent B verdict (kill confirmed, thermal signature match) → published.
4. The **settle agent** — running as an autonomous loop, not an API handler — observes both verdicts via Mirror Node, checks the agreement policy, and **executes the DEFPOINT transfer itself** (treasury → unit). This is the "agent moves value autonomously" moment; show the HashScan tx.
5. Ledger panel updates from Mirror Node; operator redeems points on the mock marketplace (transfer back to treasury).
6. Bonus shot: the weekly facility-fee **scheduled transaction** executing with no server involvement.

### Extra-points checklist (from the bounty text)

- ✅ Hedera Agent Kit — the settle agent
- ✅ HTS custom controls — KYC (World ID gate), freeze (disputes)
- ✅ HCS verifiable payment audit trail — the evidence chain is the centerpiece
- ✅ Scheduled/recurring payments — facility fees, time-locked settlement
- ◻ **HCS-14 Universal Agent IDs** — register Agents A/B/settle with on-chain identities; verdict messages reference the agent's HCS-14 ID. Cheap to add, strong differentiator ("which agent said what" is itself audit data).
- ◻ **x402 pay-per-inference** — the settle agent pays the verification agents per image analyzed (HBAR micro-payment per request via x402). This turns verification into a priced service market — do it if time allows; there's a working `x402-hedera-example` repo to crib from.
- ◻ A2A/ACP negotiation — skip unless time is abundant; adds protocol surface without strengthening the story.

### Qualification requirements — sanity check

- Agent executes ≥1 payment/token op on Testnet → the settle agent's DEFPOINT transfer ✅
- Uses Agent Kit / SDKs → both ✅
- Public repo + README with setup, architecture, payment flow → this docs folder + a README section ✅
- ≤5-min demo video of autonomous payment → the flow above, screen-recorded with HashScan side-by-side ✅

## Build order (hackathon-realistic)

1. `hedera/` module: client, DEFPOINT creation script, unit account creation, basic transfer. (~half day — this alone qualifies the SDK track's floor)
2. HCS topics + message schema + Mirror Node reads.
3. Settle agent on Hedera Agent Kit (autonomous loop watching verdicts).
4. Ledger panel in the platform UI (balances, engagement timeline, HashScan links).
5. Wire Agents A/B (0G endpoint if it cooperates; local VLM/mocked-model fallback so the demo never blocks on 0G).
6. KYC/freeze, scheduled facility fee, HCS-14 agent IDs, x402 — in that order, as time allows.

The critical de-risking rule: **the Hedera flow must work end-to-end with stubbed agent verdicts by mid-hackathon.** The vision models are swappable; the payment rail is the submission.
