# Hedera — submission form answer & feedback

Tracks we're applying to (Hedera): **"No Solidity Allowed"**, **Tokenization on Hedera**,
**AI & Agentic Payments on Hedera**.

## How are you using this Protocol / API?

We use `@hashgraph/sdk` directly for the whole settlement layer: an HCS topic is our
tamper-evident, consensus-timestamped evidence journal, and a native HTS token (DEFPOINT) pays
the responsible unit once that trail shows the verdict cleared, gated by protocol-level
KYC-grant and freeze. We're applicable because it's genuinely SDK-only with two native services
combined (no Solidity/EVM anywhere), the token carries real compliance controls (Tokenization),
and the payout itself is an autonomous, AI-triggered transfer (Agentic Payments).

## Link to the line of code where the tech is used

- HTS token ops (create, associate, KYC-grant, transfer, freeze/unfreeze):
  https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/hedera/token.ts#L47-L130
- HCS evidence journal (submit + Mirror Node replay):
  https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/hedera/journal.ts#L62-L137
- Shared client / operator setup:
  https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/hedera/client.ts#L36-L50

## How easy is it to use the API / Protocol? (1 = very difficult, 10 = very easy)

**8** — the transaction-builder pattern is consistent across HTS and HCS and easy to compose
once learned; docked for operator key-type (ECDSA/ED25519) friction not flagged by the portal
quickstart and Mirror Node base URLs/ingestion lag not called out near the main SDK docs.

## Additional feedback for the Sponsor

Provisioning (`hederaSetup.ts`) and the day-to-day transaction builders were fast to pick up —
one shared `Client`, the same `new XTransaction().setX().execute(client)` pattern across HTS and
HCS, no contract to write or deploy. Two real sharp edges: operator key type (ECDSA vs ED25519)
isn't flagged by the portal quickstart, and portal-issued ECDSA keys carry a `0x` prefix the
SDK's parser rejects, so we had to strip it ourselves (`hedera/client.ts`). Mirror Node base URLs
and its ingestion lag (a just-submitted HCS message takes a few seconds to show up on read)
also aren't called out near the main SDK docs. None of it blocked us — just cost some trial and
error.
