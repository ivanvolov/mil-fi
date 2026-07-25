# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added
- Next.js Mini App scaffolded from `@worldcoin/create-mini-app` into `my-first-mini-app/`
- World Developer Portal MCP connected at project scope (`.mcp.json`, gitignored)
- AI dev team ported from the Regata project:
  - 9-phase pipeline in `CLAUDE.md` (Challenge → … → Deliver)
  - Agents: `cto-agent`, `fullstack-dev`, `qa-engineer`, `ui-ux-specialist`
  - `/spec-interviewer` skill, adapted with World Mini App interview questions
  - Workflow tracking: `.claude/workflows/`, `.claude/sprints/`, `.claude/outputs/`
- Backend hardening kit in `my-first-mini-app/src/lib/`:
  - `logger.ts` — pino structured logging (server-side)
  - `error-handler.ts` — `withErrorHandler()` route wrapper
  - `rate-limit.ts` — in-memory sliding window (simplified from Regata's Upstash version)
  - `validators/common.ts` — Zod primitives for World payloads
- Doc set: `PRD.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `TECHNICAL_DEBT.md`, `Plan.md`
- `.gitignore` protecting `.mcp.json`, `.env*`, and `.claude/settings.local.json`

### Dependencies
- Added `pino`, `zod`; dev `pino-pretty`

### Deliberately NOT ported from Regata
- Clerk auth — World template uses wallet auth via MiniKit + `next-auth`
- Stripe — World uses MiniKit pay (WLD/USDC)
- shadcn/ui — World ships `@worldcoin/mini-apps-ui-kit-react`
- Supabase / repository layer — no database in v1 (see TECHNICAL_DEBT.md → DEBT-001)
- Python LiveKit voice agent — no voice component in scope
- GTM / market-research / content-creator agents — written around B2B SaaS sales

### Not yet done
- `.env.local` not configured; no app created in the Developer Portal
- `PRD.md` is a skeleton — no product defined yet
