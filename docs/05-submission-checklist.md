# 04 — Submission checklist & bounty strategy

Source material: the raw bounty texts live in `bounty/` (`hedera`, `0G`, `world`) and the event rules in `rules` at the repo root. This doc distills what we must *know and do* before submitting — requirements, disqualifiers, and the gotchas that differ between sponsors.

## Event rules that bind us (from `rules`)

- **Deadline: Sunday, July 26, 09:00 WEST.** Hard cutoff, no late submissions.
- **Max 3 Partner Prizes on the form** — but multiple tracks of the same partner count as **one**. Our lineup (Hedera ×2 tracks + 0G + World ×2 tracks) = exactly 3 partner prizes. Perfect fit, zero slack — adding any fourth sponsor means dropping one of these.
- **⚠️ "Start Fresh" is our biggest eligibility risk.** Classic track requires all project work to begin after the hackathon started; pre-built projects "won't qualify for partner prizes or the Finalist category." Our `platform/` has months of pre-hackathon history (RF module, orchestration, etc.). Mitigation, in order of preference:
  1. **Submit a repo where the hackathon-new work is the project**: the Hedera settlement service, verification agents, World app, and ledger UI — all built during the event window — with `platform/` explicitly declared as a pre-existing base ("starter"), transparently documented. The rules demand we "clearly distinguish between what's new and what's reused" — a `CHANGELOG-hackathon.md` with dated entries + the git history does this.
  2. If a **Continuity track** option fits at registration, take it — it legitimizes the existing codebase *and* unlocks the Continuity-only prizes we skipped (0G "Keep Building" $1,500×3 explicitly allows *independent prior work*; Hedera Automation $1,000; World Selfie/Identity continuity $1,750 each).
  3. Either way: **ask the ETHGlobal org desk / partner booths today**, before building more — not after submitting.
- **Version control discipline**: "large single commits or missing histories may be disqualified." Commit the hackathon work granularly as it happens; never squash the event window into one commit.
- **One video, 2:00–2:59 min.** ETHGlobal auto-rejects under 2 or over 4 minutes; 0G wants under 3; Hedera allows up to 5. A single ~2:50 video satisfies all three simultaneously — this supersedes any two-video plan. Production rules (auto-reject / forced resubmit): ≥720p export, no speed-ups, **no AI voiceover / TTS — record a real human voice**, no phone recording, no music-with-captions instead of narration. Intro ≤20s, slides ≤4 bullets.
- **AI-tool attribution is mandatory**: document where and how Claude Code / Copilot etc. were used (which parts, files, assets), and include **all spec files, prompts, and planning artifacts in the submission repo** — this `docs/` folder and the plan files are exactly that; ship them, don't hide them. Meaningful human contribution must be evident.
- **Live judging (if Finalist route): 7 minutes = 4 demo + 3 Q&A.** Prep answers for: what inspired it, what tools and why, what challenges you solved. Judging criteria: Technicality, Originality, Practicality, Usability, WOW factor — the negative demo (bot refused, account frozen) and the live HashScan trail are our WOW/practicality anchors. Partner judging happens from submitted materials only; booth visits are optional networking.

## What we target (one pipeline, three sponsors)

- **Hedera — 🤖 AI & Agentic Payments ($3,000 × 2 teams)** — primary. The settle agent's autonomous HTS payout is the submission.
- **Hedera — 🛠️ "No Solidity Allowed" ($1,000 × 3 teams)** — free double-qualification: same build, zero Solidity, ≥2 native services (HTS + HCS + Scheduled + Mirror Node).
- **0G — 🧠 Best AI Product ($3,000 / $2,000 / $1,000)** — the verification agents (A + B) running TEE-sealed on 0G Compute. We are a *product*, not tooling → Application track, not Infrastructure.
- **World — 🤖 AgentKit New Use Cases ($4,000 / $2,500 / $1,500)** — human-backed settlement agents in a defense-contracting economy is a genuinely new vertical and trust model (their explicit judging criterion).
- **World — 🤳 Selfie Check Beta ($1,000 / $750)** — cheap add-on *if* we actually integrate Selfie Check for operator onboarding **and** write the required testing documentation.
- **Skip:** Hedera Tokenization (fits, pays less, dilutes focus), Hedera Cross-Chain/Axelar (second chain, no narrative gain — and we're already at the 3-partner-prize cap), 0G Infrastructure track (we're a product).
- **Re-evaluate at registration:** Continuity-track prizes. We dismissed them assuming "prior ETHGlobal submission required," but 0G's "Keep Building" explicitly allows **independent prior work** — which our platform is. If we register Continuity (see Start Fresh rule above), 0G Keep Building ($1,500×3) may be a better-odds target than the crowded Best AI Product podium.

## Cross-sponsor gotchas (easy to fumble)

- **Video: one cut, 2:00–2:59.** ETHGlobal's hard window is 2–4 min, 0G wants < 3, Hedera allows ≤ 5 — a single ~2:50 video is the only length satisfying everyone (see event-rules section for the production requirements).
- **0G requires a live demo link** (or runnable build), not just a repo. Budget deploy time (Render service already exists for the platform).
- **0G requires contract deployment addresses** and **team contact info (Telegram & X)** in the submission.
- **0G requires *proof* of 0G Compute inference** — capture TEE attestation artifacts / request logs during the build, don't try to reconstruct them at 4 a.m. on demo day. If we mint Agentic IDs, the explorer link is required too.
- **World disqualifies recycled patterns**: agent reputation, human-backed benefits like API discounts, simple content-gen use cases. Our framing must stay "human-backing as the *authorization primitive for autonomous payouts*" — new vertical, new trust model — and must be a **working end-to-end flow, not a wrapper**.
- **World beta tracks (Selfie/Identity Check) require testing documentation** with *both* developer feedback (SDK/docs friction) and user feedback (UX, drop-off). Keep a running `docs/world-feedback.md` from day one; it is half the submission. Selfie/Identity full access opens only during the hackathon weekend — don't plan on integrating earlier.
- **Every sponsor requires a public GitHub repo with a real README** (setup, architecture, payment flow). This repo is currently private-ish — decide what gets extracted/published before the deadline, and scrub `.env` history (a live Mongo URI is referenced in platform docs).
- **Hedera judges look for the extra-points list** — Agent Kit usage, HCS audit trail, scheduled transactions, HCS-14 agent IDs, x402 — see [03 — Hedera integration](./03-hedera-integration.md) for which we do and in what order.

## The eligibility-check skill — when to use it

Hedera ships a skill/agent that tells you whether your project qualifies for a given challenge. Treat it as a free judge-simulator and run it **three times, not once**:

1. **Now, at idea level (before writing code).** This is the highest-value run. Feed it the concept from these docs and ask it to score us against *every* Hedera bounty, not just the one we picked. Two possible outcomes, both cheap to act on today and expensive later: (a) it flags a qualification gap while the architecture is still soft — e.g. "an API handler that sends a transfer is not an *autonomous agent*; the agent must decide and act on its own loop" — and we adjust the design, not the finished code; (b) it reveals adjacent bounties we'd qualify for with a small design tweak (this is exactly how we caught the No-Solidity double-qualification — a one-line constraint, "no Solidity anywhere," adopted at idea level, costs nothing; refactoring contracts out at the end would cost a day).
2. **Mid-build, after the Hedera flow works end-to-end with stubbed verdicts.** Hackathon scope always gets cut under pressure; this run checks that what *survived* still qualifies, while there's still time to restore a dropped requirement.
3. **Pre-submission, against the actual artifacts.** Paste the README, repo link, and video script. This run is a checklist audit, not a design tool — it catches mechanical misses (video over the limit, missing setup section, no testnet tx to point at), when fixes are cheap but discovery-by-judge is fatal.

The mistake to avoid is using it only after coding: at that point it can tell you that you failed, but not cheaply change what you built. Idea-level use is strategy; pre-submission use is QA; they answer different questions and we want both. If 0G or World expose similar checkers (World has a Docs MCP + Dev Portal MCP — close enough to interrogate requirements), apply the same three-touch pattern.

## Pre-submission checklist (final hours)

**All sponsors / ETHGlobal**
- [ ] Public repo, README covers setup + architecture + payment flow
- [ ] New-vs-reused clearly documented (dated hackathon changelog; `platform/` declared as pre-existing base)
- [ ] Granular commit history for the event window (no single mega-commit)
- [ ] AI-usage attribution section in README + planning artifacts (`docs/`, plans, prompts) included in repo
- [ ] One demo video, 2:00–2:59, ≥720p, real human voiceover, no speed-ups
- [ ] Exactly 3 partner prizes selected on the form: Hedera (both tracks), 0G, World (both tracks)
- [ ] Per-partner "how we integrated + feedback" paragraphs written (required on the form)
- [ ] Project name + short description written (reused across portals, consistent)
- [ ] Team names + Telegram + X handles collected
- [ ] No secrets in repo or git history

**Hedera (AI & Agentic Payments + No Solidity)**
- [ ] ≥1 autonomous payment/token op executed on **Testnet** by an agent — HashScan link saved
- [ ] Hedera Agent Kit (or SDK) usage stated explicitly in README
- [ ] ≥2 native services demonstrably used (HTS, HCS, Scheduled Tx, Mirror Node)
- [ ] Zero Solidity anywhere in the repo (grep for `.sol`)
- [ ] Video ≤ 5 min showing the agent paying autonomously

**0G (Best AI Product)**
- [ ] Inference demonstrably on 0G Compute / Private Computer — attestation/proof artifacts included
- [ ] Contract deployment addresses listed
- [ ] Live demo link works logged-out
- [ ] Agentic ID explorer link (if minted)
- [ ] Video **< 3 min**

**World (AgentKit + Selfie Check)**
- [ ] AgentKit verifies the settle agent is human-backed — and something *changes* based on it (payout refused for non-backed bot)
- [ ] End-to-end flow recorded, including the negative case
- [ ] Selfie Check used as a real risk/eligibility signal, not login
- [ ] `docs/world-feedback.md` — developer feedback + user feedback sections filled
