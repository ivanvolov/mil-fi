# Architecture

> Ported structure from the Regata project. Sections describing the **current template** are
> factual and filled in. Sections describing **your product** are TODO until the PRD exists.

---

## Executive Summary

A Next.js 15 App Router application running as a **Mini App inside World App**. Scaffolded from
`@worldcoin/create-mini-app`. Authentication is wallet-based via MiniKit + `next-auth` v5.
No database in v1.

**App code lives in `my-first-mini-app/`**, not the repo root.

---

## Target Architecture (Engineering Standards)

The pattern every new API endpoint must follow:

```
Request
   │
   ▼
[ Route handler ]  ≤150 lines — wrapped in withErrorHandler()
   │  1. validate input with a Zod schema  (src/lib/validators/)
   │  2. rate-limit if expensive           (src/lib/rate-limit.ts)
   │  3. delegate to a service             (src/lib/services/)
   ▼
[ Service ]  business logic, no HTTP concerns
   │
   ▼
[ Repository ]  ← DOES NOT EXIST YET (no database in v1)
   │             Add this layer when persistence is introduced.
   ▼
[ Datastore ]
```

**Never** put business logic in a route. **Never** log with `console.log` on the server.

---

## System Overview

```
┌─────────────────────────────────────────────┐
│              WORLD APP (phone)              │
│  ┌───────────────────────────────────────┐  │
│  │   Mini App webview (your Next.js UI)  │  │
│  │   @worldcoin/mini-apps-ui-kit-react   │  │
│  └──────────────┬────────────────────────┘  │
│                 │ MiniKit bridge            │
│  ┌──────────────▼────────────────────────┐  │
│  │  World App native: wallet, World ID   │  │
│  └───────────────────────────────────────┘  │
└─────────────────┬───────────────────────────┘
                  │ HTTPS
                  ▼
      ┌───────────────────────────┐
      │  Next.js API routes       │
      │  (auth, verify, pay)      │
      └───────────┬───────────────┘
                  │
                  ▼
      ┌───────────────────────────┐
      │  World Developer Portal   │
      │  + World ID registry      │
      └───────────────────────────┘
```

---

## Component Architecture

### Provided by the official template — do not rebuild

| Concern | Location | Notes |
|---------|----------|-------|
| Auth entry point | `src/auth/index.ts` | `next-auth` v5 |
| Wallet auth helpers | `src/auth/wallet/{client,server}-helpers.ts` | MiniKit `walletAuth` |
| Route protection | `middleware.ts` | Re-exports `auth` as middleware |
| Protected pages | `src/app/(protected)/` | Requires a session |
| NextAuth routes | `src/app/api/auth/[...nextauth]/` | — |
| Proof verification | `src/app/api/verify-proof/` + `src/components/Verify/` | World ID |
| Payments | `src/app/api/initiate-payment/` + `src/components/Pay/` | WLD / USDC |
| RP signature | `src/app/api/rp-signature/` | Uses `RP_SIGNING_KEY` |
| On-chain tx | `src/components/Transaction/` | `viem` |
| Mobile console | `src/providers/Eruda/` | Read client logs on device |
| UI kit | `@worldcoin/mini-apps-ui-kit-react` | Use before writing custom UI |

### Ported from Regata (this project's additions)

| Concern | Location | Notes |
|---------|----------|-------|
| Structured logging | `src/lib/logger.ts` | pino; server-side only |
| Global error handling | `src/lib/error-handler.ts` | `withErrorHandler()` wrapper |
| Rate limiting | `src/lib/rate-limit.ts` | In-memory; see limitation note in the file |
| Shared validators | `src/lib/validators/common.ts` | Zod primitives for World payloads |

---

## Configuration Management

Environment variables live in `my-first-mini-app/.env.local` (gitignored).

| Variable | Public? | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_APP_ID` | **Public** | Developer Portal app id (`app_...`) |
| `AUTH_SECRET` | Secret | next-auth signing secret |
| `AUTH_URL` | Secret-ish | ngrok URL in dev, production URL after deploy |
| `AUTH_TRUST_HOST` | Secret-ish | Local/proxy testing only |
| `HMAC_SECRET_KEY` | Secret | `openssl rand -base64 32` |
| `RP_SIGNING_KEY` | **Secret** | Relying party signing key from the portal |
| `RP_ID` | Secret | Relying party id |
| `LOG_LEVEL` | Secret-ish | Optional; `debug` for verbose logs |

> Anything prefixed `NEXT_PUBLIC_` is shipped to the browser. Never put a signing key there.

---

## Data Flow Contracts

TODO — fill in once the product has real flows. For each flow, document every layer a piece of
data passes through, so nothing is silently dropped between systems.

---

## Database Schema

**None in v1.** This is a deliberate decision, not an oversight — see
[TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) → DEBT-001.

---

## API Reference

| Endpoint | Method | Purpose | Source |
|----------|--------|---------|--------|
| `/api/auth/[...nextauth]` | GET/POST | Session management | Template |
| `/api/verify-proof` | POST | Verify a World ID proof | Template |
| `/api/initiate-payment` | POST | Start a MiniKit payment | Template |
| `/api/rp-signature` | POST | Relying-party signature | Template |

---

## Deployment Architecture

TODO — not yet deployed. Options: Vercel (native Next.js), Netlify (used for Regata).
The deployed HTTPS URL must be set as `AUTH_URL` and registered in the Developer Portal.

---

## Security Model

- **Auth**: wallet signature via MiniKit, session via `next-auth`
- **Identity assurance**: World ID proof (`orb` or `device` verification level)
- **Secrets**: server-only env vars; `.env.local` and `.mcp.json` are gitignored
- **Rate limiting**: in-memory, best-effort — not a security boundary (see file header)
- **Input validation**: Zod on every endpoint

---

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) — AI dev team pipeline
- [CONTRIBUTING.md](./CONTRIBUTING.md) — engineering quality gates
- [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) — known risks
- World docs index — https://docs.world.org/llms.txt
