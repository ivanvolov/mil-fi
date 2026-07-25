# Notification Log

**Last Updated**: 2026-07-25 — ui-ux-specialist

> Real-time agent status board. Every agent updates this file on start and on completion.
> Read this FIRST at the start of every session.

---

## Pending CEO Review

| Date | Agent | Task | Status | Output |
|------|-------|------|--------|--------|
| — | — | — | — | — |

---

## Awaiting CTO Review

| Date | Agent | Task | Branch | Output |
|------|-------|------|--------|--------|
| 2026-07-25 | ui-ux-specialist | MilFi — World identity layer UI/UX spec (verification, clearance, authorization, agent attribution) | (no repo) | `.claude/outputs/plans/milfi-identity-ui-spec.md` |
| 2026-07-25 | ui-ux-specialist | Verification Hub — Mini App UI/UX spec (3 methods on one screen) | main | `.claude/outputs/plans/verification-hub-ui-spec.md` |

**CTO — Verification Hub review priorities:**

1. **§11.8 — BLOCKING.** `secureDocumentLegacy` proves the document, not the nationality.
   `tiers.ts` needs `nationalityAllowed === true` for `VERIFIED`, which requires a separate
   `identityCheck` flow with a country declaration. Decide: ship that step, or scope the Passport
   row's copy so it does not promise taskings. Hardcoding `true` would make the privacy copy a lie.
2. **§1.1 — Orb-alone dead end.** `tierFor()` returns `UNVERIFIED` for a user holding only Orb.
   Fixed primarily in the UI (Orb rung gated behind an allow-listed passport, reads
   `Add after Passport`) so the hub never invites speculative travel. Optional one-line code fix
   as defence in depth — your call.
2b. **§1.2 — `TIER_LABELS` must never render.** "Basic" is the exact word the anti-shaming design
   removes. UI maps tiers to roles: `Reporting` / `Field ops` / `Command`.
2c. **§5.6 / §5.7 — locked states consume `explain()`'s `AccessDecision` directly.** Three reasons,
   `remedy: null` ⇒ no retry control (nationality denial is terminal). While `ACCESS_ENFORCEMENT`
   is off, `eventualTier` renders as an honest preview line, never a fake padlock.
3. **§0.1 — surface conflict.** This spec and `milfi-identity-ui-spec.md` assume opposite surfaces
   (Mini App + kit vs. desktop web, kit rejected). Pick one before either is built.
4. **§11.3** — three World ID actions must exist in the Developer Portal before UI work.
5. **§11.5** — no database. Proposed: module-level `Map<walletAddress, Credentials>` +
   `GET /api/verification-status`. Survives reloads, lost on redeploy. Accept as demo debt?
6. **§6.2** — dark-mode bug: kit rows are light, `globals.css` turns the page near-black. Declare
   `color-scheme: light` and delete the dark block.
7. **Open question 3** — is Selfie Check (preview-gated) actually enabled for this app ID? It is
   the row that matters most to field operators.

**CTO — identity layer (web console) review priorities:**

1. **§1 Decision 1 — reject `@worldcoin/mini-apps-ui-kit-react`.** MilFi is a web platform, not a
   Mini App. The kit assumes MiniKit (absent), phone chrome, and one-column thumb-reach layout.
   Recommendation: `@worldcoin/idkit` + thin Tailwind v4 layer built to design.md's structural rules.
2. **§1 Decisions 2–4 — palette / typography reassignment.** Interaction becomes achromatic so red
   can mean threat and nothing else. Clash Display dropped; JetBrains Mono first-class for all data.
   `--text-primary` → `#F2F2F5` (resolves an internal design.md conflict).
3. **§14 Q5 — BLOCKING.** AgentKit registration is documented as CLI-first. Spec §3.5 assumes a
   browser-driven path. If none exists, onboarding must be redesigned.
4. **§14 Q1** — does IDKit expose a scan-received event before proof completion? The
   `waiting → scanned` transition is the primary anti-drop-off mechanism on desktop.
5. **§5.3** — server-side anti-oracle rate limit (1 Identity Check / nullifier / 24h) with no
   database on our side. Where does it live?
6. **§12.3** — the MUST-NOT-STORE list. Recommend a CI check failing the build on those field names;
   our user-facing privacy copy is only true if that list holds.
7. **§13.7** — accepted debt: live camera capture cannot be enforced client-side. The UI must not
   claim the photo is provably live.

---

## Awaiting Coder Fix (CTO said NEEDS FIXES)

| Date | Agent | Task | Fix Required | Output |
|------|-------|------|--------------|--------|
| — | — | — | — | — |

---

## Awaiting QA

| Date | Agent | Task | Branch | Output |
|------|-------|------|--------|--------|
| — | — | — | — | — |

---

## In Progress

| Date | Agent | Task | Started | Expected Output |
|------|-------|------|---------|-----------------|
| — | — | — | — | — |

---

## Blocked

| Date | Agent | Task | Blocker | Needs |
|------|-------|------|---------|-------|
| — | — | — | — | — |

---

## Completed

| Date | Agent | Task | Outcome | Output |
|------|-------|------|---------|--------|
| — | — | — | — | — |
