# 04 — Integration contract (World ↔ Hedera/0G ↔ Web platform)

> **Audience: the partner building Hedera, 0G, and the web platform.**
> Owner of this document: the World side (`app/`).
> Status: **DRAFT — needs partner sign-off.** Written 2026-07-25 22:20 WEST.

This is the boundary. The World side owns identity, verification tiers, and human-backed agent
authorization. Everything downstream — imagery judging, on-chain settlement, the operational
web UI — is yours. Neither side needs to read the other's code; both sides need to agree on
the three interfaces below.

---

## Vocabulary

| Term | Meaning |
|------|---------|
| **nullifier** | Anonymous per-person identifier from World ID. Stable for the same person on the same app + action, **across surfaces** (phone and web). This is the join key between the mini app and the web platform. |
| **humanId** | Anonymous human identifier returned by AgentBook for a registered agent wallet. One human's multiple agent wallets all resolve to the **same** humanId. |
| **tier** | 0 UNVERIFIED · 1 BASIC (selfie) · 2 VERIFIED (passport + allow-listed nationality) · 3 ELEVATED (passport + Orb). Defined in `app/my-first-mini-app/src/lib/access/tiers.ts`. |

Two different anonymous IDs, deliberately. `nullifier` answers "which verified person is this?";
`humanId` answers "is a real unique human behind this agent?". They are not interchangeable.

---

## Interface 1 — Payout authorization (World → your Hedera payment agent)

**Who calls whom:** the operator's agent asks the World side for permission. If granted, it
receives a signed authorization, which it presents to *your* payment agent. Your agent verifies
the signature and moves the money. **Your side never has to understand World ID.**

### Request

```http
POST /api/authorize-payout
X-Agentkit: <AgentKit signature headers, added automatically by createAgentkitClient>
Content-Type: application/json

{
  "engagementId": "eng_abc123",
  "amount": "25.00",
  "currency": "USDC"
}
```

### What the World side checks, in order

1. **Agent is human-backed** — `agentBook.lookupHuman(agentAddress)`. `null` ⇒ `403 not_human_backed`.
   *This is the AgentKit qualification requirement and the demo's negative case.*
2. **Operator's tier permits it** — `payment:release` requires **Tier 3 ELEVATED**
   (passport + allow-listed nationality + Orb). Lower ⇒ `403 insufficient_tier`.
3. **Not already claimed by this human** — per-`humanId` claim tracking. Repeat ⇒ `409 already_claimed`.
   *Extra agent wallets do not help: they all resolve to the same humanId.*

### Success response

```json
{
  "authorized": true,
  "authorization": {
    "engagementId": "eng_abc123",
    "amount": "25.00",
    "currency": "USDC",
    "humanId": "0x…",
    "tier": 3,
    "issuedAt": 1785012345,
    "expiresAt": 1785012645,
    "nonce": "0x…"
  },
  "signature": "0x…"
}
```

`signature` is an EIP-191 signature over the canonical JSON of `authorization`, produced by the
MilFi World service key. **Your payment agent must verify it** against the published signer
address before releasing funds — otherwise the authorization is decorative.

- Signer address: **`TBD — World side to publish before integration`**
- Validity window: **5 minutes** (`expiresAt`). Reject anything expired.
- `nonce` is single-use. Your side should reject a repeated nonce as well, so neither side alone
  is the only defence against replay.

### Failure responses

| HTTP | `error` | Meaning | Is this the demo's negative case? |
|------|---------|---------|-----------------------------------|
| 403 | `not_human_backed` | Calling agent isn't in AgentBook — it's a bot | ✅ **yes, this is the money shot** |
| 403 | `insufficient_tier` | Real human, but not Orb+passport verified | secondary |
| 409 | `already_claimed` | This human already claimed this engagement | secondary |
| 400 | `invalid_request` | Malformed body | no |

---

## Interface 2 — Credential lookup (World → your web platform)

**The problem this solves:** a user verifies on their **phone** (inside World App, where Orb,
passport and Selfie Check flows live), then opens your **web** platform on a laptop. The web
side must know what they verified without redoing it.

**The mechanism:** the same person produces the **same nullifier** on both surfaces, because
IDKit runs on web too (QR flow). So the web platform signs the user in with World ID, gets a
nullifier, and asks us what that person has verified.

```http
GET /api/credentials/:nullifier
Authorization: Bearer <shared service token>
```

```json
{
  "nullifier": "0x…",
  "tier": 2,
  "tierLabel": "Verified",
  "credentials": {
    "selfie":   { "verifiedAt": 1785000000, "expiresAt": 1792776000 },
    "passport": { "nationalityAllowed": true, "attestedAt": 1785001000 },
    "orb":      null
  },
  "capabilities": {
    "report:submit": true,
    "report:view": true,
    "tasking:accept": true,
    "tasking:confirm": false,
    "strike:submit-proof": true,
    "payment:release": false
  }
}
```

Unknown nullifier ⇒ `404`, which your side should treat as Tier 0, not as an error.

### Rules

- **Never cache `tier` long.** Selfie Check expires after 90 days and the tier decays on its own.
  Re-read per session, or cache for minutes, not days.
- **We never send nationality.** Identity Check returns a boolean attestation; the actual
  nationality is deliberately never stored, so there is no PII honeypot. You get
  `nationalityAllowed: true|false` and nothing more.
- **Enforce server-side.** Hiding a button in your UI is a courtesy. The capability check must
  also happen on your API routes.

---

## Interface 3 — Engagement verdict (your 0G judge → World)

Needed only so the operator's agent knows *when* it is allowed to act autonomously. Minimal:

```http
POST /api/engagement-verdict
Authorization: Bearer <shared service token>

{
  "engagementId": "eng_abc123",
  "threatConfirmed": true,
  "killConfirmed": true,
  "operatorNullifier": "0x…",
  "evidenceHashes": ["0x…", "0x…"]
}
```

When both flags are `true`, the operator's agent may call Interface 1 **on its own, with no
human present** — which is the "autonomous" half of the AgentKit requirement. We store the
verdict; we do not re-judge it. Imagery and TEE attestation stay entirely on your side.

---

## Open questions for the partner

1. **Signer key exchange** — how do you want the MilFi signer address delivered? (Committed
   constant, env var, or an endpoint?)
2. **Shared service token** — one shared secret both ways, or separate per direction?
3. **Does your payment agent call us, or do we call it?** This document assumes the operator's
   agent pulls an authorization and hands it to you. Say so if you'd rather we push.
4. **Testnet only?** Assumed yes for the demo.

## Deliberately out of scope for the World side

Hedera contracts, HTS/HCS, 0G Compute and TEE attestation, imagery storage, the Leaflet map and
operational web UI, and the database. See `app/CLAUDE.md` → "SCOPE: WORLD PART ONLY".
