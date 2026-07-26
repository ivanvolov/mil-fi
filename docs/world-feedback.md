# World Feedback — Selfie Check Beta Testing Documentation

Project: **MilFi** — defense-tasking platform where payouts are released only to verified humans.
Selfie Check is used as the entry-level clearance tier (BASIC) in a three-tier trust ladder
(Selfie → Passport → Orb) that gates what an operator may do — an abuse-prevention /
eligibility signal, not a generic login.

Covers both required sections: **developer feedback** (SDK/API friction, docs gaps, setup
issues) and **user feedback** (UX friction, comprehension, drop-off, camera/selfie flow),
plus the "preferred feedback" topics from the track description.

---

## 1. Developer feedback

### Integration experience & time-to-integrate

- Integrating the Selfie Check widget + verify call took **~40 minutes even with an AI
  coding agent doing the work** — for a "low-friction" credential that is too much, and a
  human developer without an agent would have spent multiples of that. The time went into
  discovering undocumented things (API version, response shape, presets), not into writing
  code. Target should be: copy one documented example, working in 10 minutes.
- Total time from empty portal app to a verified Selfie proof round-tripping through our
  server: roughly **one evening**, most of it the surrounding loop (tunnel, portal config,
  discovering the right API version).
- The verification call itself is pleasantly small: POST the IDKit response to
  `https://developer.world.org/api/v4/verify/<rp_id>` and read `results[].identifier`.
  Once we found that shape, it worked first try.

### Where the docs helped

- The IDKit package itself is well-typed; discovering the credential presets
  (`selfieCheckLegacy`, `secureDocumentLegacy`, `orbLegacy`) from the TypeScript types was
  faster than from the docs.
- `any(selfie, passport, proof_of_human)` composing into ONE QR — with World App itself
  presenting the method chooser — is excellent design. It deleted an entire chooser UI we
  had planned to build.

### Where the docs got in the way (main friction)

1. **Selfie Check SDK reference was "coming soon" during the hackathon.** We shipped it by
   reading the IDKit type definitions and guessing. A one-page "Selfie Check end-to-end"
   example (widget config → verify call → response shape) would have saved ~2 hours.
2. **Legacy vs 4.0 presets are confusing.** `selfieCheckLegacy` requires
   `allow_legacy_proofs: true`, `passport()` (4.0) uses `false`. Mixing them in one `any()`
   request silently forces two code paths. Nothing in the docs warns about this; we found it
   by reading the preset source. Recommendation: a compatibility matrix, or make `any()`
   refuse incompatible presets loudly.
3. **v4 verify response is underdocumented.** That `results[].identifier` tells you *which*
   credential satisfied the request (essential when you tier on it, as we do) we learned by
   inspecting live responses, not docs.
4. **Staging vs production environment is a silent failure.** `environment="staging"` on the
   widget routes proofs to a network only simulator.worldcoin.org can answer — a real World
   App scanning a staging QR fails with an opaque `generic_error`. Cost us a debugging cycle.
   The error should say "environment mismatch".
5. **Tunnel/testing loop friction (mini-app side):** ngrok's free-tier interstitial page is
   impossible to dismiss inside World App's webview, so ngrok (which your testing docs
   mention) silently cannot work — we switched to cloudflared. Also, every tunnel URL change
   requires re-setting `integration_url` in the portal; a "localhost developer mode" would
   remove the biggest setup tax of the whole stack.

### What proves the document, not the person's attributes

- `secureDocumentLegacy` proves *a document was presented*, not any attribute of it
  (e.g. nationality) — attributes need a separate Identity Check flow. This distinction is
  important and easy to miss; it changed our tier design mid-build. Deserves a prominent
  call-out in the credential docs.

### Overall developer sentiment

- The primitive is right: **one `nullifier` per human across credentials** is exactly what a
  sybil-resistant payout system needs, and the server-side verify is simple.
  We would keep Selfie Check and expand it — *if* the SDK reference ships and the
  staging/legacy sharp edges get sanded down.

---

## 2. User feedback

Tested with non-technical users (founder + test users) on real phones via World App.

### Comprehension

- "Selfie Check" as a name is understood instantly — unlike "Orb" or "proof of personhood",
  which needed explanation every time. Users correctly guessed what would happen before
  tapping.
- The three-way choice screen (Selfie / Passport / Orb) after scanning one QR was understood
  as "levels of ID strength" without prompting. Good mental model for a tiered product like
  ours — users grasped "selfie gets you in, passport unlocks more" in one sentence.

### UX friction & drop-off points

1. **The selfie flow repeatedly failed with a generic error.** Our founder attempted the
   selfie **five times in a row** and every attempt ended with a "something went wrong"
   message. No reason given, no error code, no hint whether the problem was lighting, the
   camera, the network, or the service itself — just retry and fail again. This is the
   single worst moment of the beta: a user who fails five times with no explanation does
   not try a sixth. **The failure screen needs to say WHY it failed and WHAT to change.**
2. **Retrying is the only affordance, and it doesn't help.** When the real cause is not the
   selfie itself (service-side or environment issues), retaking the photo is the wrong fix —
   but it's the only button offered, so users burn attempts and patience on it.
3. **The QR handoff adds confusion on top.** Scan QR on laptop → World App opens → verify →
   nothing visibly changes on the laptop until our page polls. Combined with the failures
   above, users could not tell which side was broken.
4. **Low-assurance framing is invisible to users.** Nothing in the flow tells the user that
   Selfie is weaker than Orb; in our app we surface it as tier levels, but World App itself
   could communicate "basic verification" so user expectation matches what apps grant.

### Value of Selfie Check assurance in practice

- It let us **act**: we gate report submission at Selfie tier while keeping payout release
  at Orb tier. Without Selfie Check, our only options were "anonymous" or "Orb" — a gap so
  large that most users would have bounced. Selfie Check is the usable middle rung.
- We deliberately do **not** use it as the uniqueness guarantee (payouts key on the Orb-grade
  `humanId`); as a liveness/eligibility gate its assurance level was sufficient.

### POH (Orb) vs Selfie cohorts

- Sample too small for fraud/retention differences during a weekend hackathon. Directionally:
  Selfie converts near-100% of willing users in under a minute; Orb converted 0% of new users
  (nobody travels to an Orb mid-hackathon). Sybil score, once enabled, would slot exactly
  where our tier ladder currently trusts the document/Orb credentials — we'd use it to decide
  step-up prompts.

### Overall user sentiment

- Users trusted the flow (World App branding carries it) and were not spooked by taking a
  selfie. But trust dies on the fifth unexplained failure. Honest verdict from the beta:
  **the concept is right, the reliability and error messaging are not shippable yet.**
  Fix the failure feedback and we would keep Selfie Check as our entry tier without
  hesitation.
