# Plan — Roadmap & Batch Progress

> Ported from the Regata project. Read at the start of every session.
> Batches are small (1–2 hours), independently testable units of work.

---

## How This File Works

- **One batch per conversation.** Don't mix unrelated work.
- Every completed batch records: what shipped, files modified, how to test.
- When the CEO says "it works" → mark ✅ here, add to CHANGELOG.md, suggest a commit.
- Priorities live in `.claude/sprints/backlog.md`; this file tracks execution.

---

## Quick Status

| Item | State |
|------|-------|
| Developer Portal MCP | ✅ Connected |
| AI dev team (`.claude/`) | ✅ Installed |
| Mini App scaffolded | ✅ `my-first-mini-app/` |
| Backend hardening kit | ✅ logger, error-handler, rate-limit, validators |
| `.env.local` configured | ❌ |
| App created in portal | ❌ |
| PRD written | ❌ |
| First feature | ❌ Not started |

---

## Current Goal

**Get the untouched template running on a real phone inside World App.**

Until that works end to end, no feature work should start — otherwise you're debugging your
code and the platform setup at the same time.

---

## NEXT: Batch 0 — Setup

### 0.1 — Create the app in the Developer Portal
- Use the `world-developer-portal` MCP: `get_team_context`, then `create_app`
- Capture the App ID (`app_...`)
- **Test**: `get_app_config` returns the new app

### 0.2 — Fill `my-first-mini-app/.env.local`
- `NEXT_PUBLIC_APP_ID` — from 0.1
- `AUTH_SECRET` — `openssl rand -base64 32`
- `HMAC_SECRET_KEY` — `openssl rand -base64 32`
- `RP_SIGNING_KEY`, `RP_ID` — from the portal
- `AUTH_URL` — the ngrok URL from 0.3
- **Test**: `npm run dev` starts with no missing-env errors

### 0.3 — Tunnel + test on device
- `ngrok http 3000`, set `AUTH_URL` to the https URL, restart dev server
- Enter the App ID at https://docs.world.org/mini-apps/quick-start/testing, scan the QR
- **Test**: template opens in World App; wallet sign-in completes

### 0.4 — Write the PRD
- Interview via `/spec-interviewer`, fill [PRD.md](./PRD.md)
- **Test**: the Challenge phase can actually validate a feature against it

---

## Upcoming Batches

| ID | Batch | Depends on | Notes |
|----|-------|------------|-------|
| 1 | First product feature (TBD) | 0.4 | Defined by the PRD |

---

## Technical Debt

See [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md). Open: DEBT-001 (no DB), DEBT-002 (in-memory
rate limit), DEBT-003 (unconfigured), DEBT-004 (no PRD).

---

## Completed Batches

### Setup — AI dev team ported from Regata
**Files added**:
- `CLAUDE.md`, `CONTRIBUTING.md`, `PRD.md`, `ARCHITECTURE.md`, `TECHNICAL_DEBT.md`,
  `Plan.md`, `CHANGELOG.md`, `.gitignore`, `instructions/design.md`
- `.claude/agents/` (cto-agent, fullstack-dev, qa-engineer, ui-ux-specialist)
- `.claude/skills/spec-interviewer/`, `.claude/workflows/`, `.claude/sprints/`, `.claude/outputs/`
- `my-first-mini-app/src/lib/{logger,error-handler,rate-limit}.ts`,
  `src/lib/validators/common.ts`
- Dependencies added: `pino`, `zod`, `pino-pretty` (dev)

**How to test**: `cd my-first-mini-app && npx tsc --noEmit` → exits 0
