# 0G — submission form answer & feedback

Track we're applying to (0G): **Best AI Product on 0G** (not Infrastructure & Tooling; not Keep
Building, which is Continuity-Track-only).

## How are you using this Protocol / API?

We run two vision-inference agents on 0G Compute's OpenAI-compatible router (`qwen2.5-omni`) as
the trust anchor of an autonomous payout pipeline — Agent A judges whether a report image shows
a genuine threat, Agent B confirms destruction from post-strike footage. Both use a Private (TEE)
trust-mode key, so neither we nor the paid party can see or influence the verdict, and sensitive
military imagery is never exposed outside the enclave during inference. Money only moves once
this tamper-proof verdict clears — neither side can fake or block it, and the footage stays
confidential, which is what makes an autonomous payout on real combat footage viable at all.

## Link to the line of code where the tech is used

- Vision-agent router call (Agent A / Agent B on 0G Compute):
  https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/verification/agents.ts#L120-L163
- TEE-priority key config (Private trust mode wired first):
  https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/config.ts#L79-L87

## How easy is it to use the API / Protocol? (1 = very difficult, 10 = very easy)

**10** — the OpenAI-compatible router is a drop-in `chat/completions` call, no SDK or custom
auth flow to learn; had a real inference call running against a live 0G Compute model in under
five minutes.

## Additional feedback for the Sponsor

The OpenAI-compatible router made this the easiest integration in the whole stack — we had a
real vision-inference call running against a live 0G Compute model in under five minutes, no
SDK or custom auth flow to learn.
