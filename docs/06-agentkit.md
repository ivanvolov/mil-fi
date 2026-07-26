# 06 — AgentKit: the claim-agent, wired for real

Status: **integrated and smoke-tested end-to-end** (2026-07-26). One manual step remains —
the one-time AgentBook registration tap in World App (see "Registration", below).

## What it is, in one paragraph

The unit's **claim-agent** is the software clerk that files the payout claim so no soldier
has to click "claim my payment". It holds one EVM key — an identity anchor, **never funds**.
When an engagement becomes claimable, the platform asks the World service to sign a payout
authorization; that request now goes through World **AgentKit**: the World service answers
with a challenge (HTTP 402 + nonce), the claim-agent signs it (SIWE, EIP-191), and the
retry carries an `agentkit` header. The World service verifies the signature and resolves
the wallet in **AgentBook** (the registry contract on World Chain,
`0xA23aB2712eA7BBa896930544C7d6636a96b944dA`) to the anonymous id of the human who approved
the agent's registration. No registered human ⇒ `403 not_human_backed` ⇒ the settle-agent
has no authorization ⇒ no DEFPOINT moves. Money stays 100% on Hedera; World Chain is only
the identity layer.

## Where the code lives

- `app/my-first-mini-app/src/lib/agentkit.ts` — server side of the handshake: 402
  challenge builder, single-use nonce store, header parse → validate → signature verify →
  AgentBook lookup, and the labelled dev-stub escape hatch.
- `app/my-first-mini-app/src/app/api/authorize-payout/route.ts` — the gated endpoint:
  402 challenge → verify agent → tier gate → signed authorization.
- `platform/server/src/world/claimAgent.ts` — the agent's AgentKit client (wallet from
  `AGENT_WALLET_KEY`, chain `eip155:480`).
- `platform/server/src/world/client.ts` — `getPayoutAuthorization` now claims through the
  AgentKit client (the 402 → sign → retry loop is automatic).
- `platform/server/src/scripts/agentkitSmoke.ts` — three-caller smoke, see below.

## Environment variables

Platform (`.env` at repo root):

- `AGENT_WALLET_KEY` — the claim-agent's private key. Identity only, holds nothing.
  Current demo agent address: `0xA07e1F5eC17363BFA5fEbf8c8682E9A48482ae00`.
- `AGENT_CHAIN_ID` — CAIP-2 chain the agent signs on. Default `eip155:480` (World Chain).

World mini-app (`app/my-first-mini-app/.env.local`):

- `AGENTKIT_DEV_BACKED_ADDRESSES` — comma-separated addresses treated as human-backed
  while registration is pending. Responses are labelled `backing: "dev-stub"`, so a demo
  can never silently pass the stub off as the real thing. **Remove after registration.**
- `AGENTKIT_RPC_URL` — optional World Chain RPC override (default: chain's public RPC).
- `AGENTKIT_CHAIN_ID` — must match the platform's `AGENT_CHAIN_ID`. Default `eip155:480`.
- `AGENTKIT_RESOURCE_URI` — optional explicit resource URI when the public URL differs
  from what the server sees (tunnels, proxies). Falls back to `AUTH_URL` + path.

## Registration (the one manual step)

Needs a teammate with a **working, verified World App** (the backing human — one tap):

```bash
npx @worldcoin/agentkit-cli register 0xA07e1F5eC17363BFA5fEbf8c8682E9A48482ae00
```

The CLI prompts the World App verification flow; approving writes the agent → human
binding into AgentBook on World Chain. After it succeeds:

1. Delete `AGENTKIT_DEV_BACKED_ADDRESSES` from `.env.local` (and from Vercel env).
2. Re-run the smoke — case 3 should now report `backing: "agentbook"`.

The human is never needed again; every subsequent claim is machine-to-machine.

## Smoke test

```bash
cd platform/server
WORLD_BASE_URL=http://localhost:3000 npm run agentkit:smoke   # mini-app running locally
```

Three callers, three outcomes (verified 2026-07-26 against a local mini-app, with live
World Chain RPC for signature + AgentBook reads):

- **bot** (bare fetch, can't answer the challenge) → `402 agentkit_signature_required`.
- **impostor** (valid signature from a fresh, unregistered key) → `403 not_human_backed`.
  This is the qualification-requirement negative case, and it is real: the signature
  verified on-chain and AgentBook was consulted and had nobody.
- **claim-agent** (`AGENT_WALLET_KEY`) → signed payout authorization.

## Known limitations (honest list)

- **Nonce store is in-memory.** On serverless (Vercel) the 402 and the retry can land on
  different instances and the nonce won't match; the client then just re-handshakes. Fine
  for a demo, needs shared storage (the SDK's `AgentKitStorage`) for production.
- **Tier is still asserted by the caller** over the shared service token; only
  human-backing is proven cryptographically. Binding the AgentBook `humanId` to the World
  ID nullifier (so tier lookup keys off the proven identity) is the next step.
- **Per-humanId claim dedup** (`409 already_claimed` in docs/04) is not yet implemented.
- Registration has **no simulator/staging path** we could find — it needs a real World App
  tap, hence the dev-stub while our team's World logins are flaky.
