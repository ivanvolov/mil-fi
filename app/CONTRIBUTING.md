# Contributing — Development Workflow & Code Standards

> Ported from the Regata project. The rules below are **not** Regata-specific — they are the
> engineering standards the `cto-agent` enforces during code review.

---

## Philosophy

1. **Keep it simple** — fix in existing files before creating new ones
2. **Small iterations** — ship small batches, test, iterate
3. **One batch per conversation** — don't mix unrelated work
4. **Read before writing** — never modify code you haven't read
5. **Mobile-first** — Mini Apps run only in a phone-sized webview

---

## Session Workflow

### Start of session
1. Read `.claude/workflows/NOTIFICATION_LOG.md`
2. Read `.claude/sprints/current.md` and `backlog.md`
3. Present status summary to the CEO

### During
1. Challenge the request (ROI + "why World?")
2. Confirm understanding before coding
3. Break into sub-batches, each independently testable

### End of session
1. Update `Plan.md` — what completed, files modified, how to test
2. Update `CHANGELOG.md` — features, breaking changes
3. Update `.claude/sprints/current.md` and `NOTIFICATION_LOG.md`
4. Suggest a commit

---

## Code Standards

### Before Writing Code
1. **Read architecture** — understand where new code fits (see [ARCHITECTURE.md](./ARCHITECTURE.md))
2. **State your reasoning** — explain which file and why
3. **Check existing patterns** — reference similar implementations

### Output Format for File Changes

```
📁 [filepath]
Purpose: [one line]
Depends on: [imports]
Used by: [consumers]

[code block]

Tests: [what to test]
```

### When Architecture Changes Are Needed

```
⚠️ ARCHITECTURE UPDATE
What: [change]
Why: [reason]
Impact: [consequences]
```

---

## Engineering Quality Gates

### API Route Rules (Non-Negotiable)

| Rule | Threshold | Why |
|------|-----------|-----|
| Route file length | ≤150 lines | Forces separation of concerns |
| Business logic in routes | Zero | Must live in `src/lib/services/` |
| `console.log` on the server | Zero | Use `src/lib/logger.ts` |
| Unvalidated API input | Zero | Every endpoint needs a Zod schema in `src/lib/validators/` |
| Bare try-catch in routes | Zero | Use the `withErrorHandler()` wrapper |
| Secrets in client components | Zero | `NEXT_PUBLIC_*` is public — everything else is server-only |

### When Adding a New API Endpoint

1. Create a Zod schema in `src/lib/validators/[endpoint].ts`
   (shared primitives live in `src/lib/validators/common.ts`)
2. Create/extend a service in `src/lib/services/[domain].ts`
3. Route handler: **validate → service call → respond**
4. Wrap with `withErrorHandler()`
5. Rate-limit anything expensive or abuse-prone (`src/lib/rate-limit.ts`)

> **Repository layer**: Regata had `src/lib/repository/` between services and the database.
> This project has **no database in v1**, so that layer does not exist yet. Add it — do not
> put raw DB calls in services or routes — when persistence is introduced.

### Quality Violations

If CTO review finds quality violations → **NEEDS FIXES**, not optional suggestions.
Quality gates matter as much as functional requirements.

---

## World Mini App Constraints

### DO
- Verify MiniKit command shapes against https://docs.world.org before implementing
- Test on a real phone inside World App — a desktop browser does not prove a Mini App works
- Use `@worldcoin/mini-apps-ui-kit-react` components before writing custom UI
- Use the Eruda console (`src/providers/Eruda/`) to read client logs on device
- Keep the App ID in `NEXT_PUBLIC_APP_ID`; keep signing keys server-only

### DON'T
- **Don't add Clerk, Stripe, or shadcn/ui** — they duplicate or conflict with the World stack
- **Don't assume MiniKit API shapes from memory** — the SDK moves fast
- **Don't commit** `.env.local`, `.mcp.json`, or any World ID private key
- **Don't call `rotate_world_id_signing_key` or `submit_app_for_review`** without explicit
  CEO confirmation
- **Don't overengineer** — if the fix is 3 lines, don't create 3 files

---

## CRITICAL: Confirm Before Coding

Always rephrase and confirm before writing any code:

> **Here's what I understand:**
> - **Problem**: [what issue this solves]
> - **Solution**: [what we will build]
> - **How it works**: [behavior when user interacts]
> - **How it looks**: [visual changes, if any]
> - **Files affected**: [which files]
>
> **Is this correct?**

For complex or vague requests, use the `/spec-interviewer` skill.

---

## CRITICAL: Feature Decomposition

Every feature MUST be broken into small, testable pieces BEFORE coding.

**Red flags that a feature is too big:**
- "And then we also need..." → that's a separate batch
- More than 3 files → break it down
- No clear test criteria → define tests first
- Estimated > 2 hours → split further

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](./CLAUDE.md) | AI dev team pipeline, agent roster |
| [PRD.md](./PRD.md) | Product vision |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design |
| [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) | Known risks and constraints |
| [Plan.md](./Plan.md) | Roadmap and batch progress |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [instructions/design.md](./instructions/design.md) | UI patterns and design system |
