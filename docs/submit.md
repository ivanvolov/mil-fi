# ETHGlobal submission — form answers
## How it's made *

> Min 280 characters.

Different World ID tiers gate different roles for a reason: a Selfie Check is what lets a
civilian spotter's report enter the pipeline at all, and only Orb-verified administrators can
set the payout thresholds the settle-agent enforces later on. An interceptor then fires from the
air; the strike footage feeds directly into a 0G Compute vision model running in a TEE trust
mode, so the threat/kill verdict is produced somewhere neither we nor the paid party can
influence, and military data stays safe. That verdict, and a hash of the footage, get posted to
a Hedera Consensus Service topic. A settle-agent built on the Hedera SDK reads that topic
through Mirror Node, decides the conditions are met, and moves DEFPOINT tokens on the Hedera
Token Service straight to the unit's account. It only fires the transfer after checking, via
World's AgentKit, that the wallet asking to be paid is actually backed by a real, unique,
verified person; a bot with no human behind it gets refused.

## 0G — Best AI Product ($6,000)

**Sub-track:** Best AI Product on 0G (not Infrastructure & Tooling; not Keep Building, which is
Continuity-Track-only).

**How are you using this Protocol / API?**
We run two vision-inference agents on 0G Compute's OpenAI-compatible router (`qwen2.5-omni`) as
the trust anchor of an autonomous payout pipeline — Agent A judges whether a report image shows
a genuine threat, Agent B confirms destruction from post-strike footage. Both use a Private (TEE)
trust-mode key, so neither we nor the paid party can see or influence the verdict, and sensitive
military imagery is never exposed outside the enclave during inference.

**Why applicable for this prize:**
Money only moves when a tamper-proof, TEE-sealed 0G model confirms the kill — neither side can
fake or block that verdict, and the imagery stays confidential, which is exactly what makes
autonomous payouts on real combat footage viable.

**Link to line of code:**
https://github.com/ivanvolov/mil-fi/blob/129d6cf2f8eb0c3e344ad65b5fbfcd854ce59095/platform/server/src/verification/agents.ts#L120-L163

**How easy is it to use the API / Protocol? (1-10):** 10

**Additional feedback for the Sponsor:** see [`02-bounty/0g-submission.md`](./02-bounty/0g-submission.md).