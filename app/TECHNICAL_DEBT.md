# Technical Debt

> Ported from the Regata project. The `cto-agent` reads this before approving any plan.
> Debt recorded here is **accepted on purpose** — the point is that it's visible, not that
> it's fixed.

---

## How to Use This Document

**Before implementing ANY feature, check this file:**

1. Does this feature worsen existing debt?
2. Does this feature depend on fixing debt first?
3. Does it violate a constraint below?

If a feature conflicts with a constraint → warn the CEO before proceeding.

---

## Risk Severity Levels

| Level | Meaning |
|-------|---------|
| 🔴 **Critical** | Blocks launch or creates a security hole |
| 🟠 **High** | Blocks scale; will hurt within weeks |
| 🟡 **Medium** | Slows development; fix when convenient |
| ⚪ **Low** | Cosmetic or speculative |

---

## Active Risks

### DEBT-001 — No database 🟠

**What**: v1 has no persistence layer. Nothing survives a page reload beyond the auth session.

**Why it exists**: Deliberate v1 scoping decision — fastest path to something testable on a phone.

**Consequences**:
- No user profiles, history, leaderboards, or saved state
- The repository layer described in [ARCHITECTURE.md](./ARCHITECTURE.md) does not exist

**Constraint for Claude**: If a requested feature needs persistence, **stop and say so**. Do not
silently fake it with `localStorage` or in-memory state and call the feature done.

**Fix when**: the first feature genuinely requires stored state.

---

### DEBT-002 — Rate limiting is in-memory only 🟡

**What**: `src/lib/rate-limit.ts` keeps counters in process memory.

**Consequences**: On serverless, each instance has its own counters, so real limits are looser
than configured and reset on cold start.

**Constraint for Claude**: Never describe this as a security control. It is abuse dampening.
Anything that must be strictly limited needs a shared store first.

**Fix when**: a datastore exists — swap the Map for Upstash Redis behind the same
`checkRateLimit()` signature.

---

### DEBT-003 — Project scaffolded but unconfigured 🔴

**What**: `my-first-mini-app/.env.local` has no real App ID, `AUTH_SECRET`, `HMAC_SECRET_KEY`,
or `RP_SIGNING_KEY`. No app exists in the Developer Portal yet.

**Consequences**: The app cannot run against World App at all.

**Fix when**: immediately — this is the current P0. See `.claude/sprints/backlog.md`.

---

### DEBT-004 — No product definition 🔴

**What**: [PRD.md](./PRD.md) is a skeleton. The ROI gatekeeper in the Challenge phase has
nothing to validate feature requests against.

**Consequences**: Every "let's build X" request will be un-challengeable, which is exactly the
failure mode this whole pipeline was designed to prevent.

**Fix when**: before the first feature batch. Use `/spec-interviewer`.

---

## Constraints for Claude Code

1. **Do not introduce a database casually.** It's a real architectural decision — raise it, get
   a decision, then add the repository layer properly.
2. **Do not add Clerk, Stripe, or shadcn/ui.** They conflict with the World stack.
3. **Do not claim a feature is done if it only works until reload** — see DEBT-001.
4. **Do not treat `NEXT_PUBLIC_*` as private.**
5. **Do not skip the PRD** by inferring product intent from code.

---

## Resolved Risks

*(none yet)*

---

## Priority Fix Order

1. DEBT-003 — configure env + create the portal app
2. DEBT-004 — write the PRD
3. DEBT-001 — database, when a feature demands it
4. DEBT-002 — shared rate-limit store, after DEBT-001
