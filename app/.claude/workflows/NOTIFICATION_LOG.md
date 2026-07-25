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

**CTO — review priorities:**

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
