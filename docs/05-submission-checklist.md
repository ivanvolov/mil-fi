# 05 — Submission checklist

Source material: the raw bounty texts live in [`02-bounty/`](./02-bounty/) (`hedera`, `0G`,
`world`) and the event rules in `rules` at the repo root. This doc distills the requirements
that bind the submission and the final pre-submission checklist.

## Event rules that bind us

- **Deadline: Sunday, July 26, 09:00 WEST.** Hard cutoff, no late submissions.
- **Max 3 partner prizes on the form** — multiple tracks of the same partner count as one.
  Selected: Hedera (2 tracks) + 0G + World (2 tracks) = exactly 3 partner prizes.
- **Start Fresh / new-vs-reused transparency.** `platform/` has pre-hackathon history (the
  coordination map). It is declared openly as the pre-existing base; everything built during
  the event window (settlement backend, verification agents, World app integration, consoles)
  is distinguishable via the dated changelog and the granular git history, as the rules
  require ("clearly distinguish between what's new and what's reused").
- **Version control discipline:** granular commits through the event window; no squashed
  mega-commit.
- **One video, 2:00–2:59.** ETHGlobal's hard window is 2–4 minutes, 0G wants under 3, Hedera
  allows up to 5 — a single ~2:50 cut satisfies all three. Production requirements: ≥720p
  export, no speed-ups, real human voiceover (no TTS), no phone recording, intro ≤20s.
- **AI-tool attribution is mandatory:** where and how AI coding tools were used, with the
  spec files, prompts, and planning artifacts included in the repo — that is this `docs/`
  folder and the plan files; they ship with the submission.
- **Live judging (if Finalist): 7 minutes = 4 demo + 3 Q&A.** Judging criteria: Technicality,
  Originality, Practicality, Usability, WOW factor.

## Tracks submitted

- **Hedera — AI & Agentic Payments:** the settle-agent autonomously executes HTS token
  transfers on Testnet, built on the Hedera SDK, with the payment flow documented in the
  README and verifiable on HashScan.
- **Hedera — No Solidity Allowed:** the same build, SDK-only by construction: HTS + HCS +
  Mirror Node in active use, zero Solidity anywhere in the repo.
- **0G — Best AI Product:** verification Agents A and B run inference on 0G Compute
  (`qwen2.5-omni`, Private/TEE trust-mode key), with proof-of-inference artifacts captured.
- **World — AgentKit New Use Cases:** human-backing as the authorization primitive for
  autonomous payouts — the AgentKit check determines whether money moves, including the
  refusal path for a non-backed bot.
- **World — Selfie Check Beta:** Selfie Check as the spotter eligibility signal, with the
  required testing documentation in [`world-submission.md`](./02-bounty/world-submission.md) (developer
  feedback + user feedback).

## Per-sponsor requirements to honor

- **0G requires a live demo link** (or runnable build), not just a repo — it must open
  logged-out.
- **0G requires proof of 0G Compute inference** — captured during the build: request ids,
  `x_0g_trace` objects, and the console Activity screenshot in
  [`evidence/`](./evidence/).
- **0G requires team contact info (Telegram & X)** on the submission form.
- **World requires a working end-to-end flow, not a wrapper** — including the negative case
  (payout refused for a non-backed bot).
- **World beta tracks require testing documentation** with *both* developer feedback
  (SDK/docs friction) and user feedback (UX, drop-off) — [`world-submission.md`](./02-bounty/world-submission.md).
- **Hedera requires** a public repo with a README covering setup, architecture, and the
  payment flow; ≥1 agent-executed token operation on Testnet with a HashScan trail; for the
  No-Solidity track, ≥2 native services and zero `.sol` files.
- **Every sponsor requires a public GitHub repo.** The repo is public
  (https://github.com/ivanvolov/mil-fi); tracked files and history contain no secrets — local
  `.env` files are gitignored, only `.env.sample` / `.env.example` are committed.

## Pre-submission checklist (final hours)

**All sponsors / ETHGlobal**
- [x] README covers setup + architecture + payment flow
- [x] New-vs-reused clearly documented (`platform/` declared as pre-existing base)
- [x] Granular commit history for the event window
- [x] AI-usage attribution section in README + planning artifacts (`docs/`) in repo
- [x] One demo video, 2:00–2:59, ≥720p, real human voiceover
- [x] Repo public (https://github.com/ivanvolov/mil-fi); no secrets in tracked files or git history
- [ ] Exactly 3 partner prizes selected on the form: Hedera, 0G, World
- [ ] Per-partner "how we integrated + feedback" paragraphs written on the form
- [ ] Team names + Telegram + X handles entered on the form

**Hedera (AI & Agentic Payments + No Solidity)**
- [x] ≥1 autonomous payment/token op executed on Testnet by an agent — HashScan links in README
- [x] Hedera SDK (`@hashgraph/sdk`) usage stated explicitly in README
- [x] ≥2 native services demonstrably used (HTS, HCS, Mirror Node)
- [x] Zero Solidity anywhere in the repo (`grep -r "\.sol"` → no hits)
- [ ] Video ≤5 min shows the agent paying autonomously

**0G (Best AI Product)**
- [x] Inference demonstrably on 0G Compute — request ids + trace objects + console screenshot
- [x] Which 0G features/SDKs used — explained in README (Compute router, TEE trust mode)
- [x] Live demo link works logged-out — https://mil-fi.onrender.com (health: `/api/v1/health`)
- [ ] Video <3 min

**World (AgentKit + Selfie Check)**
- [x] AgentKit verifies the claim-agent is human-backed — and the payout genuinely depends on
      it (bot → 402, unregistered → 403, registered → signed authorization)
- [x] End-to-end flow works, including the negative case
- [x] Selfie Check used as a real eligibility signal, not login
- [x] `world-submission.md` — developer feedback + user feedback sections filled
