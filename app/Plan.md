# Plan — Roadmap & Batch Progress

> Read at the start of every session. **Scope: World part only** — see
> [CLAUDE.md](./CLAUDE.md) → "SCOPE: WORLD PART ONLY". Hedera and 0G belong to the partner.

---

## How This File Works

Three sections do the tracking. Keep them in sync — that's the whole point of the file.

1. **Feature Registry** — every feature gets an ID (`F1`, `F2`, …), a one-line description,
   and a status. Features are *what* we're building.
2. **Batch Log** — batches are *how* we build. Each batch is 1–2 hours, delivers part of one
   or more features, and is independently testable.
3. **Done** — completed batches move here with files touched and how to re-test.

### Adding a new feature

1. Append a row to **Feature Registry** with the next free `F` number
2. Status starts as `⬜ Not started`
3. Add one or more batches to **Batch Log** that deliver it, referencing the `F` id
4. Never delete a feature — if dropped, set status `❌ Cut` and write why in the Notes column

### Status legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done and verified on a real phone |
| ⛔ | Blocked — reason in Notes |
| ❌ | Cut from scope — reason in Notes |

### Rules

- **One batch per conversation.** Don't mix unrelated work.
- A batch isn't ✅ until the CEO has tested it on his phone and said so.
- When the CEO says "it works" → mark ✅ here, add to CHANGELOG.md, suggest a commit.
- Every batch must state **how to test it** in plain, numbered steps.

---

## Quick Status

**Deadline: Sunday 26 July 2026, 09:00 WEST.**

| Item | State |
|------|-------|
| Developer Portal MCP | ✅ Connected |
| Mini App scaffolded | ✅ `my-first-mini-app/` |
| `.env.local` configured | ✅ |
| App created in portal | ✅ `app_3e54fa415d153fbd5fd72033452b27f8` |
| Runs on real phone in World App | ✅ Verified 2026-07-25 21:45 |
| Wallet sign-in works on phone | ✅ Verified 2026-07-25 21:45 |
| PRD — World section | 🟡 Interviewed, needs writing up |
| First product feature | ⬜ Not started |

---

## Feature Registry

Target: **World AgentKit** track + **World Selfie Check** track (both = one partner prize).

| ID | Feature | Track | Status | Notes |
|----|---------|-------|--------|-------|
| F1 | **Selfie Check gate** — app locked until passed; unlocks all functionality | Selfie Check | ⬜ | Absorbed into F9 as one of three methods. ⚠️ Beta, SDK ref "coming-soon" |
| F2 | **Register user's agent** — link an agent wallet to the logged-in operator via AgentBook | AgentKit | ⬜ | `npx @worldcoin/agentkit-cli register <addr>` |
| F3 | **Payout authorization endpoint** — verify caller via `lookupHuman`, refuse if `null` | AgentKit | ⬜ | The core qualification requirement |
| F4 | **One-human-one-payout** — track claims per `humanId`, block repeats | AgentKit | ⬜ | In-memory (CEO decision 2026-07-25) |
| F5 | **Autonomous agent run** — agent calls the endpoint itself when criteria are met | AgentKit | ⬜ | Node script, runs on laptop, not in the phone app |
| F6 | **Handoff contract to partner** — signed authorization the Hedera agent consumes | Integration | ⬜ | Must be agreed with partner early |
| F7 | **Feedback docs** — `docs/world-feedback.md`, developer + user sections | Selfie Check | ⬜ | **Mandatory** — no doc, no prize |
| F8 | ~~Deploy mini app to Vercel~~ | Infra | ❌ Cut | **Partner's scope** (with hosting + database), CEO decision 2026-07-25. We keep using the cloudflared tunnel locally |
| F9 | **Verification Hub** — three ways to prove humanity, all visible in-app: Selfie Check, Passport (NFC), Orb | Both | ⬜ | Supersedes F1's single-method gate. UI spec via `ui-ux-specialist` |
| F10 | **Credential persistence** — store what a user verified, keyed by World ID nullifier; wire `resolveCredentials()` to it | Both | ⬜ | ⚠️ **The tier system is dead code until this exists.** `resolveCredentials()` is a stub returning `ANONYMOUS` |
| F11 | **Cross-surface credential bridge** — web platform reads the same credentials the phone wrote | Integration | ⬜ | Same nullifier = same person on both surfaces. Contract with partner (web is their scope) |
| F12 | **Turn enforcement on** — `ACCESS_ENFORCEMENT=on`, capabilities actually gated | Both | ⬜ | One env var. Do LAST — flipping it early blocks all development |

### Key facts established (do not re-derive)

- **AgentBook** is a contract on World Chain. Server calls `lookupHuman(address) → humanId | null`.
  `null` = not human-backed = bot.
- **Registration is manual and separate from Selfie Check.** Passing Selfie Check does NOT add a
  wallet to AgentBook. Nothing links them automatically — we enforce "both" ourselves.
- **One human may register many agent wallets; they all resolve to the SAME `humanId`.**
  Usage is tracked per human (`tryIncrementUsage(endpoint, humanId, limit)`), so extra wallets
  do not grant extra payouts. This is what makes the sybil demo real.
- **Selfie Check is low-assurance** — "not as strong as Orb or NFC". Use it as an access gate,
  never as the uniqueness guarantee. `humanId` is the strong primitive.
- Packages: `@worldcoin/agentkit`, `@worldcoin/agentkit-core`, `@worldcoin/agentkit-cli`.

### Verification methods — verified against the installed `@worldcoin/idkit`

All three the CEO asked for are real IDKit presets. Confirmed present in the package, not assumed:

| Method | IDKit preset | Assurance | Friction |
|--------|--------------|-----------|----------|
| Selfie Check | `selfieCheckLegacy` | LOW — World's own wording: "not as strong as Orb or NFC" | Lowest — a camera selfie |
| Passport (NFC) | `secureDocumentLegacy` | HIGH — document-backed | Medium — physical passport + NFC tap |
| Orb | `orbLegacy` | HIGHEST — biometric unique personhood | Highest — must travel to an Orb |

Use the **`*Legacy` presets for all three** — they share `allow_legacy_proofs: true`, so one
request config covers everything. `passport()` is the 4.0 preset using `false` and would force a
second code path for no gain.

Other presets that exist but we are not using: `documentLegacy`, `deviceLegacy`, `passport`.

⚠️ **`secureDocumentLegacy` proves the DOCUMENT, not the NATIONALITY.** `tiers.ts` requires
`passport.nationalityAllowed === true` to reach VERIFIED, and that boolean comes only from an
`identityCheck` request with a declared country — a **separate second flow**. So either Identity
Check ships too, or the Passport row must not promise taskings. Never hardcode `true`: it would
make the privacy claim in the spec a lie. **Unresolved — see B3.**
Existing reference implementation: `src/components/Verify/index.tsx` (Orb) →
`/api/rp-signature` → `/api/verify-proof`. New methods follow the same request/verify shape.

### Architecture — who owns what

| Agent | Does what | Owner |
|-------|-----------|-------|
| Judge agent | Inspects uploaded imagery, rules threat/kill | Partner (0G) |
| Payment agent | Fires the Hedera contract to move money | Partner (Hedera) |
| **User's agent** | Authorizes the transfer with no human present when criteria are met | **Us (World)** |

Surfaces: **mini app (phone)** = identity, Selfie Check, agent registration, authorization.
**`platform/` (web, Render, Leaflet 2D map)** = operational UX. Mini app deploys to Vercel.

---

## Batch Log

Ordered by **risk first, value second** — the things that could kill a track are proved early,
while there's still time to react.

**Reordered 2026-07-25 22:35 on the CEO's call: demo-first vertical slice.** Rather than building
horizontally (spike, then hub, then store, then bridge) and having nothing filmable until late, B3
now cuts one thin slice through *every* layer — web → QR → World App → verify → store → display.
It produces a recordable demo early and de-risks Selfie Check, credential storage and the
phone→web bridge simultaneously.

| ID | Batch | Delivers | Est. | Depends on | Status |
|----|-------|----------|------|------------|--------|
| B1 | ~~Deploy to Vercel~~ | F8 | — | — | ❌ Cut — partner's scope |
| B2 | **Handoff interfaces to partner** | F6, F11 | 30m | — | 🟡 Draft → `docs/05-integration-contract.md`. Needs sign-off |
| **B3** | **VERTICAL SLICE: web login → QR → verify → JSON** (see sub-batches below) | F9, F10, F11 | 90m | — | ⬜ **NEXT** |
| B4 | **Register an agent** — agent wallet linked to operator in AgentBook | F2 | 60m | — | ⬜ |
| B5 | **Payout authorization + refusal** — `lookupHuman`, reject `null` (negative demo) | F3 | 60m | B4 | ⬜ |
| B7 | **Autonomous agent run** — script calls the endpoint itself, no human | F5 | 45m | B5 | ⬜ |
| B6 | **One-human-one-payout** — per-`humanId` claim tracking | F4 | 45m | B5 | ⬜ |
| B9 | **Feedback docs** — `docs/world-feedback.md`, dev + user sections | F7 | 45m | B3 | ⬜ |
| B8 | **Verification Hub (mini app)** — standing + add-clearance screen | F9 | 60m | B3 | ⬜ Now optional — see note |
| B11 | **Credential lookup endpoint** — `GET /api/credentials/:nullifier` for partner's platform | F11 | 20m | B3 | ⬜ |
| B12 | **Flip enforcement on** — `ACCESS_ENFORCEMENT=on`, verify each tier gates | F12 | 20m | B3 | ⬜ |

### B3 sub-batches — each independently testable

| # | Sub-batch | How you test it | Est. |
|---|-----------|-----------------|------|
| **3a** | Web page at `/console` with a Login button that renders an IDKit QR for `any(selfie, passport, proof_of_human)` | Open the page on your laptop → a QR appears | 🟡 built, awaiting CEO test |
| **3b** | Scan → World App offers the three methods → complete Selfie → server verifies the proof | Scan, pick Selfie, take the photo → server logs a verified proof | 30m |
| **3c** | Store credentials by nullifier; web polls and renders the JSON of what we know | The web page refreshes itself and prints your tier + credentials as JSON | 30m |

### Why B8 dropped down the list

`any()` means **World App presents the three choices itself** after the scan — we do not have to
build a chooser to get the CEO's flow working. B8 (the mini-app hub showing standing and
"add clearance") remains valuable and its spec is written
(`.claude/outputs/plans/verification-hub-ui-spec.md`), but it is no longer on the critical path
for a working demo. If time runs out, B3 alone demonstrates multi-credential verification.

**Total ≈ 6.2 hours** — down from 7.4h, because the vertical slice absorbed old B10 and most of
B8, and `any()` removed the need to build a credential chooser.

⚠️ Still tight. ~10 hours remain, minus sleep, the 2:50 video and the README — call it ~5.5
usable hours. Cut order if we slip: **B12 → B8 → B6 → B11**.

**Never cut B3/B4/B5/B7.** B4/B5/B7 ARE the AgentKit qualification requirements; B3 is the only
thing that produces a filmable demo, and everything downstream depends on credentials existing.

### Why this order

- **B2 first** because the partner is blocked until the interface exists. It's 15 minutes and
  it unblocks someone else to work in parallel.
- **B3 second** because Selfie Check is Beta with a "coming-soon" SDK reference. If it can't
  be called, we learn at 30 minutes' cost instead of at 4am, and B8 degrades to Orb + Passport
  rather than collapsing.
- **B4/B5/B7 are the spine.** They are literally the AgentKit qualification requirements
  ("uses AgentKit meaningfully", "verifies an agent is human-backed", "working end-to-end
  flow"). Everything else is upside.

### ⚠️ Consequence of cutting Vercel (B1)

We stay on the cloudflared tunnel, so **the URL churn risk from tonight remains live** for the
rest of the build. Rules to avoid re-breaking it:

- Kill the dev server with `pkill -f "next dev"` — **never** `lsof -ti:3000 | xargs kill`,
  which also kills the tunnel and mints a new URL (see CLAUDE.md → "Kill stuck port")
- If the tunnel does die, three things must be updated together: `AUTH_URL`, a dev-server
  restart, and `integration_url` in the portal

---

## Technical Debt

See [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md). Open: DEBT-001 (no DB — accepted for the
hackathon, in-memory only), DEBT-002 (in-memory rate limit), DEBT-004 (PRD incomplete).

New: **DEBT-005 — in-memory state means a server restart wipes all reports, payouts and
eligibility.** Accepted deliberately for demo speed. Risk: a restart mid-filming loses demo state.

---

## Done

### 2026-07-25 — Batch 0: Setup + get template running on a real phone ✅

**What shipped**
- App created in Developer Portal (`app_3e54fa415d153fbd5fd72033452b27f8`, RP `rp_ce4e751875b77790`)
- `.env.local` filled: `AUTH_SECRET`, `HMAC_SECRET_KEY`, `RP_SIGNING_KEY`, `RP_ID`, `AUTH_URL`
- Replaced ngrok with **cloudflared** (ngrok free injects an interstitial World App's webview
  cannot dismiss — see CLAUDE.md → "Expose for phone testing")
- Fixed the real blocker: portal `integration_url` was still the template placeholder
  `https://a1b2c3d4e5f6.ngrok-free.dev`
- Working folder consolidated to `mil-fi/` (the git repo); `World_app/` is a stale untracked copy
- Removed empty stray `app/.env.example`

**Files modified**: `app/CLAUDE.md`, `app/my-first-mini-app/.env.local`, `app/Plan.md`,
deleted `app/.env.example`

**How to re-test**
1. `cd "/Users/nazarijgrecanik/Desktop/Vibecoding/mil-fi/app/my-first-mini-app" && npm run dev`
2. In a second terminal: `cloudflared tunnel --url http://localhost:3000`
3. Put the printed URL in `AUTH_URL`, restart the dev server, and set `integration_url` in the
   portal (command in CLAUDE.md → "Expose for phone testing")
4. Enter App ID at https://docs.world.org/mini-apps/quick-start/testing, scan the QR
5. ✅ MilFi home screen loads with "Verify with World ID"

### Setup — AI dev team ported from Regata ✅

**Files added**: `CLAUDE.md`, `CONTRIBUTING.md`, `PRD.md`, `ARCHITECTURE.md`,
`TECHNICAL_DEBT.md`, `Plan.md`, `CHANGELOG.md`, `.gitignore`, `instructions/design.md`,
`.claude/agents/`, `.claude/skills/spec-interviewer/`, `.claude/workflows/`,
`.claude/sprints/`, `.claude/outputs/`,
`my-first-mini-app/src/lib/{logger,error-handler,rate-limit}.ts`,
`src/lib/validators/common.ts`. Dependencies: `pino`, `zod`, `pino-pretty` (dev).

**How to test**: `cd my-first-mini-app && npx tsc --noEmit` → exits 0
