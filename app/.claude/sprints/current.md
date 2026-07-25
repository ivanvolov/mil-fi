# Current Sprint

**Started**: 2026-07-25
**Goal**: MilFi — defence C2 prototype, ETHGlobal Lisbon. Ship the **World identity layer**
(verification, clearance, authorization, agent attribution). Storage = 0G (partner),
payments = Hedera (partner).

> ⚠️ **Surface change**: MilFi is a **web platform** (World ID `external` app + IDKit),
> **not** a World App Mini App. The "mobile-first mandatory" and "use the Mini App UI kit" rules
> in CLAUDE.md / design.md do **not** apply. Desktop is the primary surface.

---

## Sprint Objectives

1. [x] UI/UX spec for the World identity layer
2. [ ] CTO review of the spec (Phase 5) — **next**
3. [ ] Create `external` World ID app in Developer Portal + configure allow-list action
4. [ ] Implement verification onboarding (IDKit QR + deep link)
5. [ ] Implement clearance ladder + locked-action states
6. [ ] Implement threat report + camera capture (0G seam)
7. [ ] Implement tasking authorization screen + AgentKit attribution
8. [ ] Demo toggles for denial / unbacked-agent / expiry / camera-denied states

---

## Active Work

| Task | Agent | Branch | Status | Last Update |
|------|-------|--------|--------|-------------|
| MilFi World identity layer — UI/UX spec | ui-ux-specialist | (no repo) | ✅ COMPLETE → awaiting CTO | 2026-07-25 |
| Verification Hub (Mini App) — UI/UX spec | ui-ux-specialist | main | ✅ COMPLETE → awaiting CTO | 2026-07-25 |

**Output**: `.claude/outputs/plans/milfi-identity-ui-spec.md`
**Output**: `.claude/outputs/plans/verification-hub-ui-spec.md`

> ⚠️ **The two specs assume opposite surfaces.** The identity-layer spec is a desktop web console
> that rejects the UI kit; the Verification Hub spec is a mobile Mini App built on the UI kit, per
> `instructions/design.md`. Both may be correct (console for command, Mini App for field
> operators) but the team must say which is being built. See verification-hub-ui-spec.md §0.1.

**Verification Hub — blocking items before implementation:**
1. **Nationality attestation** — `tiers.ts` needs `passport.nationalityAllowed === true` for
   `VERIFIED`, and that comes from an `identityCheck` flow not in this batch. Ship the extra step,
   or scope the Passport row's copy. **Never hardcode `true`.** (spec §11.8)
2. **Orb-alone dead end** — `tierFor()` returns UNVERIFIED for Orb without passport (tiers.ts:104).
   Primary fix is UI: the Orb rung is gated behind an allow-listed passport and reads
   `Add after Passport`, so the hub never invites speculative travel to an Orb. Optional one-line
   code fix in §1.1 as defence in depth.
6. **`TIER_LABELS` must not reach the screen** — "Basic" is the exact word the anti-shaming design
   eliminates. UI maps tiers to roles (`Reporting` / `Field ops` / `Command`), spec §1.2.
7. **All locked states app-wide consume `explain()`'s `AccessDecision`** (§5.6) — three reasons,
   `remedy: null` means render no retry button. `eventualTier` renders as an honest preview line,
   never a fake padlock (§5.7).
3. **Three World ID actions** (`verify-selfie` / `verify-passport` / `verify-orb`) must exist in
   the Developer Portal before UI work, or every row fails looking like a UI bug.
4. **Selfie Check is preview-gated** — confirm it is enabled for
   `app_3e54fa415d153fbd5fd72033452b27f8`, or the row most field operators need is permanently
   unavailable.
5. **Dark-mode bug** — `globals.css` flips the page to `#0a0a0a` while kit rows stay
   `bg-gray-50 / text-gray-900`. Declare `color-scheme: light`. Two minutes; prevents a demo failure.

**Decisions needing CTO ratification** (spec §1):
1. Reject `@worldcoin/mini-apps-ui-kit-react` — built for Mini App webviews, depends on absent MiniKit
2. Reassign palette — interaction achromatic, all colour reserved as semantic (red = threat only)
3. Drop Clash Display; JetBrains Mono promoted to first-class for all data
4. `--text-primary` → `#F2F2F5`, not pure white (resolves a design.md internal conflict)

**Blocking dependency**: AgentKit registration is documented as CLI-first
(`npx @worldcoin/agentkit-cli register`). Onboarding assumes a browser-driven path — see spec §14 Q5.

**Not a git repo** — commit step of the agent exit checklist deliberately skipped, no `git init` run.

---

## Pending CEO Review

| Task | Agent | Date | Output |
|------|-------|------|--------|
| — | — | — | — |

---

## Blocked

| Task | Agent | Blocker | Needs |
|------|-------|---------|-------|
| — | — | — | — |

---

## Completed This Sprint

| Task | Agent | Date | Output |
|------|-------|------|--------|
| — | — | — | — |
