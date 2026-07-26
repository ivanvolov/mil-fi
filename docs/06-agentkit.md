# 06 — AgentKit: the claim-agent, wired for real

Status: **fully live** (2026-07-26). Integrated, smoke-tested end-to-end, and the claim-agent
is **registered in AgentBook on World Chain** — registration tx
[`0xb9ec0636…bdff3dc`](https://worldscan.org/tx/0xb9ec0636ab16b11ab7e40d08eda9761af1262282ed4f5085ed51de982bdff3dc),
`lookupHuman(0xA07e…ae00)` → `0x2a81…d5be` (= the backing human's World ID nullifier hash).
The dev-stub has been removed; the smoke reports `backing=agentbook`.

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

## Registration — DONE (2026-07-26)

Performed with `npx @worldcoin/agentkit-cli register 0xA07e1F5eC17363BFA5fEbf8c8682E9A48482ae00`:
World ID verify link → World App approval → registration tx submitted via the relay
(`x402-worldchain.vercel.app`). Result on World Chain mainnet:

- Tx: `0xb9ec0636ab16b11ab7e40d08eda9761af1262282ed4f5085ed51de982bdff3dc`
- `lookupHuman` now resolves the agent to human
  `0x2a81207095f2386480e0936b6d91e9b747d315f5ae9c80cafa70db618d5be` — byte-for-byte the
  nullifier hash shown during the World ID verification step. AgentBook's "anonymous human
  id" IS the World ID nullifier: no PII on chain, but sybil-resistant by construction.

`AGENTKIT_DEV_BACKED_ADDRESSES` has been removed from `.env.local` — **also remove it from
the Vercel env if it was ever set there.** The backing human is never needed again; every
claim is machine-to-machine from here.

To register a different agent later (new unit = new wallet, one tap per agent):

```bash
npx @worldcoin/agentkit-cli register <new-agent-address>
```

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

- **Challenge nonces are stateless (HMAC-signed), not centrally tracked.** Any instance
  can verify a nonce another instance issued — required on Vercel, where the 402 and the
  retry land on different lambdas. Replay defence is TTL (5 min) + per-instance dedup;
  a cross-instance replay inside the TTL is possible in theory. Production would use the
  SDK's `AgentKitStorage` on shared storage. (The HMAC key comes from `HMAC_SECRET_KEY` /
  `AUTH_SECRET`, already set in the mini-app env.)
- **Tier is still asserted by the caller** over the shared service token; only
  human-backing is proven cryptographically. Binding the AgentBook `humanId` to the World
  ID nullifier (so tier lookup keys off the proven identity) is the next step.
- **Per-humanId claim dedup** (`409 already_claimed` in docs/04) is not yet implemented.
- Registration has **no simulator/staging path** we could find — it needs a real World App
  tap, hence the dev-stub while our team's World logins are flaky.
