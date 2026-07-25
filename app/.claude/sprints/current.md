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

**Output**: `.claude/outputs/plans/milfi-identity-ui-spec.md`

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
