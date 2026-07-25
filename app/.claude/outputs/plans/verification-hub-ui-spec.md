# UI/UX Spec: Verification Hub (World Mini App)

**Date**: 2026-07-25
**Agent**: ui-ux-specialist
**Status**: COMPLETE
**Surface**: World App Mini App — `my-first-mini-app/`. Mobile only, one column.
**Build budget**: 45–60 min, one developer.

---

## 0. Summary

One screen, `/(protected)/verify`: **your clearance, and how to raise it.** Three World ID
credentials — Selfie Check, Passport, Orb — all visible at once, rendered as the rungs of the
ladder that `src/lib/access/tiers.ts` already implements.

It is a **ladder, not a menu**. Orb does not stand alone: it carries no nationality, the country
gate is non-negotiable, and so Orb *stacks on top of* Passport. The screen must never let a user
conclude "just do Orb, it's the best one" — that sends someone on physical travel to an Orb and
leaves them where they started.

The design rests on one reframe:

> **The rungs are not three grades of person. They are three job scopes.**

Selfie Check is not "weak verification". It is the credential that lets you report threats and
be paid for them — which is what a field operator does. Orb is not "real verification". It is
the credential a government confirmer needs to authorise force and move public money — which a
field operator does not do. Assurance still ranks (Orb > Passport > Selfie) and the UI never
hides that, but it is expressed as **clearance for a role**, never as **how trustworthy you
are**. Section 3 is the full treatment; it is the load-bearing part of this spec.

The product's own sentence, which the whole screen serves:

> Selfie-verified observing units report. Passport-verified allow-listed units get tasked.
> Orb-verified government confirms force and moves money.

**Three surfaces total**: the hub screen, one bottom Drawer (reused for all three methods), and
the row states. Everything else is kit components and copy.

---

## 0.1 Surface conflict — read before building

`.claude/sprints/current.md` currently records "MilFi is a **web platform**, not a Mini App"
and the prior spec (`milfi-identity-ui-spec.md`) rejects the UI kit on that basis. **This spec
assumes the opposite** — the Mini App surface, per the task brief and `instructions/design.md`.

Both can be true (a web console for command, a Mini App for field operators), but the team must
say so out loud. Treat this spec as authoritative **for the Mini App only**. Nothing here
contradicts the prior spec's tier model or privacy copy discipline — it deliberately reuses both.

---

## 1. Grounding: the tier model already exists in code

`my-first-mini-app/src/lib/access/tiers.ts` and `policy.ts` are already written and are the
source of truth. This screen renders them; it does not invent a parallel model.

| Tier | Earned by | Capabilities (`policy.ts`) |
|---|---|---|
| `UNVERIFIED` (0) | nothing | none |
| `BASIC` (1) | valid Selfie Check (90-day expiry) | `report:submit` |
| `VERIFIED` (2) | Passport with `nationalityAllowed: true` | + `report:view`, `tasking:accept`, `strike:submit-proof` |
| `ELEVATED` (3) | Passport **+** Orb | + `tasking:confirm`, `payment:release` |

Two facts from that code the UI must never contradict:

- **Orb carries no nationality.** It stacks *on top of* passport; it never replaces it. The hub
  must never present Orb as a shortcut past the passport step.
- **A denied nationality is terminal** (`isNationalityDenied`). No retry affordance, ever.

### 1.1 Orb-alone is a dead end — and the UI is the primary fix

`tierFor()` (tiers.ts:104) returns `UNVERIFIED` for a user holding **only** Orb: the passport
branch fails and Orb has no fallback. Someone could travel to an Orb, complete the hardest
verification in the product, and end up exactly where they started. That is the worst outcome
this screen can produce, and it is a **design** problem before it is a code problem.

**Primary fix — the UI never offers Orb as a standalone entry point.** The Orb row is rendered
`Locked` until a passport credential is held (§5.2), stating the dependency in the row itself:
`Add after Passport`. There is no path from the hub to an Orb request without a passport. This is
non-negotiable — travel is the most expensive action any user of this product can take, and the
UI must not invite it speculatively.

**Secondary fix — one line, defence in depth**, for a user who somehow arrives holding Orb
(verified elsewhere, or the dependency gate regresses):

```ts
// tiers.ts, inside tierFor(), after the passport checks:
if (credentials.orb) return Tier.BASIC;   // Orb proves unique humanity — at least as strong as a
                                          // Selfie Check for the humanity gate. It carries no
                                          // nationality, so it can never reach VERIFIED alone.
if (selfieIsValid(credentials.selfie, now)) return Tier.BASIC;
```

Without the line, "any credential gets you in" is false for Orb. With it, Orb-alone grants
reporting and nothing more — which is honest, since Orb genuinely cannot answer the country
question. CTO's call; the UI is correct either way because it never routes there unaided.

### 1.2 Never render `TIER_LABELS` verbatim

`tiers.ts` exports `TIER_LABELS` as `Unverified / Basic / Verified / Elevated`. **"Basic" is
precisely the word §3 bans** — it tells a field operator their clearance is the entry-level one,
which is the shaming this screen is designed to avoid. Those labels are engine identifiers; they
are fine in logs and code, and wrong on screen.

The UI maps tiers to roles, in one place:

```ts
// src/components/VerificationHub/labels.ts
export const TIER_ROLE: Record<Tier, string> = {
  [Tier.UNVERIFIED]: 'Not verified',
  [Tier.BASIC]:      'Reporting',
  [Tier.VERIFIED]:   'Field ops',
  [Tier.ELEVATED]:   'Command',
};
```

Same for `TIER_REQUIREMENTS`, whose strings ("Complete a Selfie Check") are serviceable but do
not carry the covers/checks/receives structure of §4.3. Use them as the `remedy` fallback only
(§5.6), never as primary row copy.

---

## 2. User Flow

```
[Home / any locked action]
     │  "Verify to continue"
     ▼
[VERIFICATION HUB  /verify]
     │
     ├─ screen-loading ──► Skeleton rows (status fetch)
     │      └─ status fetch fails ──► [Neutral error row + Retry]  (rows still tappable)
     │
     ▼
[Header: current standing]  +  [3 method rows, ordered by effort ascending]
     │
     │  tap any row
     ▼
[DRAWER — one method]
   what World checks / what MilFi receives / what this covers
     │
     ├─ "Not now" ──────────────────────────► back to hub, row unchanged
     │
     └─ primary action ──► IDKit.request(...).preset(<method>)
              │            row → PENDING (Spinner), drawer stays open, button locked
              │
              ├─ success ──► POST /api/verify-proof
              │        ├─ ok ────► row → VERIFIED (CircularState success) + Haptic
              │        │            drawer auto-closes after 900ms
              │        │            header re-renders at new tier
              │        │            └─ first credential ever ──► "You're in" header + Continue
              │        └─ 4xx ──► row → FAILED, drawer shows fix + Try again
              │
              ├─ user_rejected / cancelled ──► row → IDLE, drawer stays open, no error shown
              │
              ├─ credential_unavailable ─────► row → UNAVAILABLE, drawer explains + closes path
              │
              ├─ nullifier_replayed /
              │  max_verifications_reached ──► row → FAILED (terminal), no retry button
              │
              └─ timeout / connection_failed ► row → FAILED, "Try again" (our fault, neutral tone)
```

Exit: `Continue` in the BottomBar once any credential is held; it routes back to wherever the
user was gated, or `/home` on a cold entry.

---

## 3. Assurance without shaming — the design problem

Most MilFi field operators will never stand in front of an Orb. If the hub reads as a ladder
they are failing to climb, it insults the people the product exists to serve. Six rules, each
with the reason it exists.

### Rule 1 — Rank by job scope, never by grade

The right-hand adornment on each idle row is a `Chip` naming **what the credential covers**:

| Method | Chip label | Never label it |
|---|---|---|
| Selfie Check | `Reporting` | "Basic", "Low", "Level 1" |
| Passport | `Field ops` | "Standard", "Medium" |
| Orb | `Command` | "Highest", "Full", "Best" |

"Command" is a role a field operator has no reason to want. "Level 3" is a rank they are missing.
Same information; opposite feeling. The hierarchy is still legible — Reporting ⊂ Field ops ⊂
Command is obvious from the words — without any of them being a score.

### Rule 2 — Order by effort ascending, not strength descending

Row order, top to bottom: **Selfie Check → Passport → Orb.**

A strength-descending list makes the top item the real one and everything under it a consolation
prize. Effort-ascending reads as "start here", and the reachable option gets the position of
highest attention. Fixed order, never re-sorted by state — spatial memory matters on a screen
users return to.

### Rule 3 — The first credential is a finish line, not a step

The moment any one method verifies, the header changes register completely:

```
before:  Prove you're human
         One check is enough to get in. Which one you do decides
         what you can be assigned.

after:   ✓ Verified — Reporting                      [VerificationBadge]
         Selfie Check is enough to report and get paid for reports.
```

That second line is the whole spec in one sentence: it states **sufficiency**, not deficiency.
And the section heading below it changes from `Ways to prove you're human` to:

```
Add clearance
Only if your role needs it.
```

Four words that release the user from the ladder. Do not cut them.

### Rule 4 — No completion counter, no progress bar

Explicitly rejected: `1 of 3 complete`, a `Progress` bar filling toward Orb, a stepper. Every one
of them frames three independent credentials as one unfinished task and makes Orb feel mandatory.
The kit has `Progress`; **do not use it on this screen.**

### Rule 5 — Not-started is neutral, never a deficit

An un-attempted row uses no error colour, no warning glyph, no grey-out, no lock icon. It looks
like a menu item, because that is what it is. Colour appears on a row **only** after the user has
attempted something (success / error) or when the method is genuinely unavailable.

### Rule 6 — Locks are rules about the action, not judgements of the person

Where the hub explains why something needs Orb, the sentence attaches to the action:

> "Confirming a tasking commits force, and releasing funds moves public money. Both require Orb.
> That's a rule about those two actions, not about you."

And the Orb drawer states its own barrier before the user invests a tap:

> "You have to visit an Orb in person. Most field operators won't have one nearby — that's
> expected, and it doesn't limit reporting or taskings."

### Rule 7 — A prerequisite is a sequence, not a refusal

The Orb rung depends on the Passport rung. Say that as an order of operations, never as a
rejection:

| Never | Always |
|---|---|
| `Locked — passport required` | `Add after Passport` |
| `You are not eligible for Orb` | `Orb builds on Passport. Add your passport first.` |
| A padlock glyph on the row | A neutral row, dimmed adornment, ordinal copy |

Reason: "locked" implies a gate someone is being held behind; "after" implies a queue they are
already standing in. Same restriction, and the second one is also more accurate — Orb genuinely
cannot answer the country question, so doing it first would not have helped anyone.

### Banned / required vocabulary

| Never write | Write instead |
|---|---|
| Basic, low, weak, limited, minimal | *(name the scope: Reporting)* |
| Only a selfie / just a selfie | Selfie Check |
| Upgrade, level up, unlock more, get verified *properly* | Add Passport / Add Orb |
| Stronger verification, better proof | Covers taskings / covers command actions |
| You need to… (for optional methods) | Add this if you'll be… |
| Insufficient, not enough | *(state what it does cover)* |

---

## 4. Layout

One column. `Page.Header` / `Page.Main` / `Page.Footer` from `src/components/PageLayout`.
No cards. The kit's `ListItem` is already a filled rounded row (`bg-gray-50 rounded-2xl`, 76px) —
placing it on the page background *is* the surface. Wrapping these rows in a container card is
the cardocalypse the anti-pattern list forbids.

```
┌───────────────────────────────────┐
│ TopBar   "Verification"      ‹    │   Page.Header
├───────────────────────────────────┤
│                                   │
│ Prove you're human                │   Typography heading/2
│ One check is enough to get in.    │   Typography body/3, gray-500
│ Which one you do decides what     │   ← max 2 lines
│ you can be assigned.              │
│                                   │   24px
│ WAYS TO PROVE YOU'RE HUMAN        │   Typography label/1, gray-500, uppercase
│                                   │   8px
│ ┌───────────────────────────────┐ │
│ │ ◐  Selfie Check      Reporting│ │   ListItem  ← startAdornment / label
│ │    Camera only · ~30 sec    › │ │             description / endAdornment
│ └───────────────────────────────┘ │
│              8px                  │
│ ┌───────────────────────────────┐ │
│ │ ▣  Passport         Field ops │ │
│ │    Hold passport to phone   › │ │
│ └───────────────────────────────┘ │
│              8px                  │
│ ┌───────────────────────────────┐ │
│ │ ◎  Orb                Command │ │   ← dimmed while no passport held;
│ │    Add after Passport       › │ │     description swaps to
│ └───────────────────────────────┘ │     "In person, at an Orb" once it is
│                                   │   24px
│ Nothing is sent to MilFi until    │   Typography body/4, gray-500
│ you approve it in World App.      │   ← trust line, always present
│                                   │
├───────────────────────────────────┤
│ [ Continue ]                      │   Page.Footer — only once ≥1 credential
└───────────────────────────────────┘   held. Absent while UNVERIFIED.
```

Everything above fits one viewport on a 375×667 device with no scroll. That is the point of
putting the per-method detail in a drawer.

### 4.1 Why a Drawer, and why exactly one

`ListItem`'s `description` renders with `truncate` — **one line, clipped, no wrap** (verified in
the kit source). Honest disclosure of what each method checks and receives cannot live in a row.
It has to go somewhere; a bottom sheet is the World-native answer, it is thumb-adjacent, and the
kit ships it.

One `<MethodDrawer>` component, driven by `openMethod: 'selfie' | 'passport' | 'orb' | null`.
Three drawers would be three times the code for zero user benefit.

### 4.2 Drawer content

```
┌───────────────────────────────────┐
│              ▁▁▁▁                 │   grabber (kit)
│                                   │
│ Selfie Check              [Beta]  │   DrawerTitle + Chip variant="warning"
│                                   │
│ WHAT THIS COVERS                  │   label/1
│ Submit threat reports and get     │
│ paid for them.                    │
│                                   │
│ WHAT WORLD CHECKS                 │
│ A live person is present, and     │
│ it's the same person as before.   │
│                                   │
│ WHAT MILFI RECEIVES               │
│ Yes or no. No photo, no face      │
│ data — the check happens inside   │
│ World App.                        │
│                                   │
│ Valid for 90 days, then re-check. │   body/4, gray-500
│                                   │
│ ┌───────────────────────────────┐ │
│ │  Take a Selfie Check          │ │   LiveFeedback > Button primary lg fullWidth
│ └───────────────────────────────┘ │
│  Not now                          │   Button tertiary — dismiss
└───────────────────────────────────┘
```

Three literal headings — **covers / checks / receives** — in that fixed order for all three
methods. The user learns the shape once and reads the second and third drawers in two seconds.

### 4.3 Copy deck (verbatim)

| Field | Selfie Check | Passport | Orb |
|---|---|---|---|
| Row description | `Camera only · about 30 sec` | `Hold your passport to your phone` | no passport: `Add after Passport` · passport held: `In person, at an Orb` |
| Chip | `Reporting` | `Field ops` | `Command` |
| Beta pill | yes (`warning`) | no | no |
| Covers | Submit threat reports and get paid for them. | Accept taskings, see other units' reports, and submit strike proof. | Confirm taskings and release payment. |
| Prerequisite | — | — | **Passport first.** "Orb builds on Passport. Orb proves you're a unique human but carries no nationality, and taskings are limited to permitted nations — so Passport has to come first." |
| Checks | A live person is present, and it's the same person as before. | Your passport's chip is genuine and belongs to you. | That you're a unique human, verified in person. |
| Receives | Yes or no. No photo, no face data — the check happens inside World App. | Yes or no. No name, no document number, no image. | Yes or no. Orb carries no nationality and no identity. |
| Footnote | Valid for 90 days, then re-check. | Taskings are limited to permitted nations. Your document is checked against that list inside World App; MilFi only sees the answer. | You have to visit an Orb in person. Most field operators won't have one nearby — that's expected, and it doesn't limit reporting or taskings. |
| Primary button | `Take a Selfie Check` | `Scan my passport` | passport held: `Verify at an Orb` · otherwise: `Scan my passport first` (swaps the drawer to Passport — never a dead end) |
| Extra control | — | — | tertiary `Where are the Orbs?` → `https://world.org/find-orb` |

Row descriptions are ≤ 34 characters. Longer strings clip mid-word — this is a hard limit, not
a style preference.

**Forbidden copy anywhere on this screen** (carried from the prior spec, still binding): naming
any permitted or denied country; "unfortunately" / "we're sorry" for a deterministic policy
result; "contact support" or "appeal" (no such process exists); "try a different document";
anything implying MilFi holds, saw, or stored a document or a face.

---

## 5. Screen States

### 5.1 Screen level — the four required by design.md

| State | Visual | User can do | Kit component |
|---|---|---|---|
| **Empty** (UNVERIFIED, nothing attempted) | Header "Prove you're human" + 2-line body. Three idle rows. No footer button. | Tap any row | `Typography`, `ListItem`, `Chip` |
| **Loading** (status fetch on mount) | Header renders immediately (static copy). Three `Skeleton` blocks at 76px / `rounded-2xl` / 8px gap, exactly replacing the rows. | Nothing; rows absent | `Skeleton` |
| **Success** (≥1 credential held) | Header swaps to `VerificationBadge verified` + "Verified — Reporting" + sufficiency line. Section heading becomes "Add clearance / Only if your role needs it." Held rows show `CircularState success`. Footer `Continue` appears. | Continue, or open any row | `VerificationBadge`, `CircularState`, `Button`, `Haptic` |
| **Error** (status fetch failed) | Rows render **idle and tappable** — a status outage must not block verifying. Above them, one neutral line: "Couldn't load your verification status. You can still verify below." + tertiary `Retry`. No red. | Retry, or verify anyway | `Typography`, `Button variant="tertiary"` |

The error state deliberately degrades to the empty state rather than to a blocking error. Our
outage must never look like the user's problem, and it must never stop them from getting in.

### 5.2 Per-method row states

Each row is independent. `endAdornment` carries the state; `description` carries the detail.

| State | startAdornment | description | endAdornment | Tappable |
|---|---|---|---|---|
| **Idle** | `CircularIcon size="sm"` + iconoir glyph, gray-500 | method description | `Chip` (scope) + `NavArrowRight` gray-400 | yes → drawer |
| **In progress** | same, gray-900 | `Waiting for World App…` | `Spinner` | no (`disabled`) |
| **Verified** | `CircularState value="success" size="sm"` | Selfie: `Valid for 87 more days` · others: `Verified 25 Jul` | `Chip variant="success"` (scope) | yes → held drawer |
| **Failed** | `CircularState value="error" size="sm"` | the fix, ≤34 chars (see 5.3) | `NavArrowRight` | yes → drawer with fix + retry |
| **Awaiting prerequisite** (Orb, no passport) | `CircularIcon size="sm"` + glyph, gray-400 | `Add after Passport` | `Chip` (scope), gray-400 + `NavArrowRight` | yes → drawer, primary button routes to Passport |
| **Unavailable** | `CircularState value="warning" size="sm"` | `Not available in this World App` | `Chip variant="warning" label="Beta"` | yes → drawer, explains, no primary button |
| **Denied** (nationality, Passport only) | `CircularState value="error" size="sm"` | `Taskings aren't available to you` | *(no Chip — the scope was not granted)* | yes → drawer §5.5, **no retry control** |
| **Expired** (Selfie only) | `CircularState value="warning" size="sm"` | `Expired — re-check to keep reporting` (34 ch: use `Expired — re-check to report`) | `Chip variant="warning"` | yes → drawer, button reads `Re-check` |

**Cancelled is not a state.** `user_rejected` / `cancelled` returns the row silently to Idle. The
user made a choice; do not render it as a failure. This is design.md's explicit MiniKit rule.

### 5.3 Failure map — IDKit error code → UI

Verified against `@worldcoin/idkit-core` `IDKitErrorCodes`.

| Error code | Row state | Row description | Drawer copy | Recovery |
|---|---|---|---|---|
| `user_rejected`, `cancelled` | Idle | *(unchanged)* | *(unchanged)* | Button stays; no message |
| `credential_unavailable` | Unavailable | `You don't have this credential yet` | "This credential isn't set up in your World App yet." | Point to the other two methods by name |
| `world_id_3_not_available`, `world_id_4_not_available`, `failed_by_host_app` | Unavailable | `Not available in this World App` | "Your version of World App can't run this check yet." | "Update World App, or use [other methods]" |
| `verification_rejected`, `user_presence_failed` | Failed | `Check didn't pass — try again` | Selfie: "Try even lighting, remove glasses, hold steady." Passport: "Hold the phone flat against the back cover and keep it still." | `Try again` |
| `max_verifications_reached`, `nullifier_replayed` | Failed (**terminal**) | `Already used on another account` | "This credential is already linked to a different MilFi account. Sign in with that account to use it." | **No retry button.** `Close` only |
| `inclusion_proof_pending` | Failed | `Not ready yet — try in a few minutes` | "World is still finalising this credential." | `Try again` |
| `rp_signature_expired`, `timestamp_too_old`, `invalid_timestamp`, `duplicate_nonce` | Failed | `Session expired — start again` | "That verification session timed out." *(no jargon — never show the code name)* | `Try again` (re-fetches `/api/rp-signature`) |
| `connection_failed`, `timeout`, `generic_error`, `unexpected_response` | Failed | `Couldn't reach World — try again` | "Something on our side didn't respond." | `Try again` |
| `unknown_rp`, `inactive_rp`, `invalid_rp_signature`, `malformed_request`, `invalid_rp_id_format` | Failed | `Verification is misconfigured` | "MilFi can't run this check right now. This is a problem on our side, not yours." | `Close`. Log to server — this is a deploy bug |
| server `/api/verify-proof` non-200 | Failed | `Couldn't confirm — try again` | "World approved it, but MilFi couldn't confirm it." | `Try again` |

Tone rule, applied throughout: **our failures are neutral, the user's are instructive, policy
outcomes are factual.** Never spend a warning colour on our own outage.

### 5.4 Re-verification and adding methods

- **Every verified row stays tappable.** A verified row that goes inert makes the user think the
  screen is broken; it also removes the only place to see when a credential expires.
- **Held drawer** (Passport / Orb): title, `Verified on 25 July 2026`, the three
  covers/checks/receives blocks unchanged, and a single tertiary `Close`. No primary button —
  there is nothing to redo.
- **Selfie held**: same, plus `Valid for 87 more days` and a tertiary `Re-check now`. Never a
  primary button — nagging a valid credential is noise.
- **Selfie expired**: primary button returns, labelled `Re-check`. Row is `warning`, not `error` —
  expiry is a schedule, not a failure.
- **Upgrading Selfie → Orb**: fully supported, and it is just "tap the Orb row". No wizard, no
  migration, no confirmation. Nothing is lost: `Credentials` is additive by construction
  (`tiers.ts`), so holding Selfie *and* Orb is a normal state, and the header shows the highest
  tier earned. If Selfie later expires while Orb is held, the user's tier does not drop — worth
  stating in the drawer? **No.** That is engine detail; the row already shows the truth.
- **Order never changes on verification.** A verified row does not jump to the top.

### 5.5 Nationality denied (passport attested false) — terminal

Row: `CircularState value="error"`, description `Taskings aren't available to you`.
Drawer, verbatim, no retry control anywhere in it:

> **Taskings aren't available**
>
> Your document was checked against MilFi's permitted-nation list inside World App. The check
> returned no match.
>
> MilFi received a yes-or-no answer only. We did not receive — and cannot store — your
> nationality, your name, your document number, or any image of your document.
>
> This outcome is final for this deployment. Reporting stays open to you: a Selfie Check lets you
> submit threat reports and be paid for them.
>
> `[ Close ]`

If the user holds no other credential, the drawer's single button is `Take a Selfie Check`
instead of `Close` — never dead-end someone on the terminal screen.

---

### 5.6 The `AccessDecision` contract — locked states everywhere else in the app

`explain(credentials, capability)` in `src/lib/access/index.ts` already returns exactly what a
locked UI needs. **Every locked state in MilFi renders from that object. No component branches on
a tier, and no component writes its own lock copy.** That is what keeps the copy from drifting
out of sync with the policy — which it always eventually does when hand-written.

```ts
const decision = explain(credentials, 'tasking:accept');
if (!decision.allowed) return <LockedPanel decision={decision} />;
```

`LockedPanel` switches on `decision.reason` — three cases, exhaustively:

| `reason` | Panel copy | Action | Terminal? |
|---|---|---|---|
| `'insufficient-tier'` | `{CAPABILITY_NAME} needs {TIER_ROLE[decision.requiredTier]} clearance.` then `decision.remedy` verbatim | primary → Verification Hub, deep-linked to the row that raises `requiredTier` | no |
| `'selfie-expired'` | "Your Selfie Check expired. A new one takes about 30 seconds." (`decision.remedy` is the fallback) | primary `Re-check` → hub, Selfie drawer open | no |
| `'nationality-denied'` | §5.5 copy, exactly | **no verification action.** Offer only "Back" and, if they hold nothing, `Take a Selfie Check` | **yes** |

Rules:

- **`remedy: null` means render no verification button.** The code already encodes terminality by
  nulling the remedy; the UI must respect it rather than helpfully inventing a retry. A retry
  button on the nationality-denied panel is a spec violation.
- **Order matters and is already correct in `explain()`** — nationality-denied is reported before
  insufficient-tier. Do not reorder client-side.
- **Never show `decision.currentTier` as a number or as `TIER_LABELS`.** Use `TIER_ROLE` (§1.2).
- Capability display names live beside `TIER_ROLE`, not inline:
  `report:submit` → "Submitting reports", `report:view` → "Other units' reports",
  `tasking:accept` → "Accepting taskings", `tasking:confirm` → "Confirming taskings",
  `strike:submit-proof` → "Submitting strike proof", `payment:release` → "Releasing payment".

### 5.7 `eventualTier` — honest preview while enforcement is off

`ACCESS_ENFORCEMENT` is off, so `requiredTier()` returns `UNVERIFIED` for everything and
`decision.allowed` is `true` everywhere. `eventualTier` exists precisely so the UI can tell the
truth about that.

**Do not fake a lock.** A padlock on an action that is currently open is a lie, and the first
time a user taps through it anyway the whole clearance model loses credibility.

Render a preview instead — one line, no glyph, no colour, `gray-500`, below the action:

```
Will require Field ops clearance
```

Shown when `decision.allowed && decision.eventualTier > decision.currentTier`. It disappears the
moment the user's tier covers it, and it silently becomes a real `LockedPanel` when enforcement
is switched on — same data source, no copy to rewrite.

On the hub itself this appears nowhere: the hub's job is the rungs, and the rungs already state
what each covers.

---

## 6. Visual Spec

### 6.1 Colour — kit tokens only

No custom palette. The kit's `globals.css` (already imported in `layout.tsx`) defines
`--gray-0…900`, `--success-*`, `--warning-*`, `--error-*`, `--info-*`. Use those Tailwind classes.

```
Page background      white (Page.Header is bg-white; keep Main consistent)
Row surface          gray-50    (ListItem's own default — do not override)
Text primary         gray-900   (ListItem default)
Text secondary       gray-500   (descriptions, footnotes, section labels)
Success              success-*  via CircularState / Chip variant="success"
Warning / Beta       warning-*  via CircularState / Chip variant="warning"
Error                error-*    via CircularState value="error"
```

One accent, one meaning: `success` = credential held. `warning` = attention but not broken (beta,
expired, unavailable). `error` = this attempt failed. Nothing else uses colour.

### 6.2 Dark mode — a real bug to fix first

`src/app/globals.css` sets `body { background: #0a0a0a }` under `prefers-color-scheme: dark`,
while the kit's `ListItem` hardcodes `bg-gray-50 text-gray-900`. On a phone in dark mode the page
goes near-black behind light rows — unreviewed, unshippable, and it will happen on the demo
device if it is set to dark.

**Fix (choose one, ~2 min):**

```css
/* Preferred — the kit is a light design system; say so. */
:root { color-scheme: light; }
/* and delete the @media (prefers-color-scheme: dark) block from globals.css */
```

design.md requires both schemes to work. The kit does not ship a dark scale, so the honest answer
is to declare light and move on — not to hand-tune a second theme at a hackathon. Record as debt.

### 6.3 Typography — `Typography` component only

| Element | Props |
|---|---|
| Screen heading | `<Typography variant="heading" level={2} as="h1">` |
| Header body | `<Typography variant="body" level={3} className="text-gray-500">` |
| Section label | `<Typography variant="label" level={1} className="text-gray-500 uppercase">` |
| Drawer heading | `DrawerTitle` (kit-styled) |
| Drawer block label | `variant="label" level={1}`, gray-500 |
| Drawer block body | `variant="body" level={3}` |
| Row label / description | supplied by `ListItem` — do not restyle |

No raw `<h1>`/`<p>` with Tailwind sizes. No `Clash Display`, no `Satoshi`, no custom font — the
app already loads Geist and the kit ships its own stack.

### 6.4 Icons — `iconoir-react`

| Use | Icon |
|---|---|
| Selfie Check | `UserSquare` |
| Passport | `Passport` (fallback `BookmarkBook`) |
| Orb | `EvPlugCharging`? **no** — use `Globe` |
| Row affordance | `NavArrowRight` |
| Drawer external link | `OpenNewWindow` |

16px inside `CircularIcon size="sm"`, gray-500 idle. Icons appear **only** in the 24px row
adornment slot. No decorative icon above any heading — that is on the anti-pattern list.

### 6.5 Spacing

Kit / Tailwind scale only: rows `gap-2` (8px), header-to-section `mt-6` (24px), section
label-to-first-row `mt-2` (8px), trust line `mt-6`. `Page.Main` already supplies `p-6 pt-3`.
No arbitrary pixel values.

---

## 7. Responsive Behaviour

| Breakpoint | Layout |
|---|---|
| All widths | **Identical.** One column, full-width rows, drawer full-width. No desktop breakpoint exists — the screen only ever renders in a phone-sized webview inside World App. |

Only true constraint: at 320px the `Chip` + `NavArrowRight` adornment competes with the label.
Set `label` truncation on and verify `Selfie Check` + `Reporting` fits at 320px. If it does not,
drop `NavArrowRight` on the idle row (the Chip is affordance enough) — do **not** shorten the
Chip labels; they carry the whole hierarchy argument.

---

## 8. Interactions

| Element | Press | Focus | Disabled | Notes |
|---|---|---|---|---|
| `ListItem` row | kit's own press feedback; opens drawer | kit focus ring — do not remove | only during that row's `pending`; `disabled` + `Spinner` | Whole 76px row is the target — far past 44px |
| Drawer primary `Button` | kit press state | kit ring | while `pending` | Wrapped in `LiveFeedback` (`pending` / `success` / `failed`) exactly as `Verify/index.tsx` does today |
| `Not now` / `Close` (tertiary) | kit press | kit ring | never | Also reachable via the drawer's swipe-down and backdrop tap |
| Footer `Continue` | kit press | kit ring | never rendered when it would be disabled | Absence beats a disabled primary action |
| `Where are the Orbs?` | opens external | kit ring | never | `<a target="_blank" rel="noreferrer">`; verify World App's webview honours it on device |

**Haptic** fires once, on a credential transitioning to verified. Not on row taps, not on drawer
open, not on failure. design.md: meaningful confirmations only.

---

## 9. Animation Spec

| Animation | Trigger | Duration | Easing |
|---|---|---|---|
| Drawer enter/exit | open / dismiss | kit default (vaul) | kit default |
| `LiveFeedback` state swap | pending → success/failed | kit default | kit default |
| Drawer auto-close after success | 900ms after `success` | — | — |

That is the entire animation surface. Everything is the kit's; nothing is authored. There is no
animation system here on purpose — this screen has a 45-minute budget and motion is the first
thing to cut.

`prefers-reduced-motion` is honoured by the kit's own components; add nothing.

---

## 10. Accessibility Checklist

- [ ] Tap targets ≥ 44×44px — `ListItem` is 76px; buttons are `size="lg"`
- [ ] Contrast ≥ 4.5:1 — kit `gray-900` on `gray-50` and `gray-500` on `gray-50` both pass; verify
      `gray-500` descriptions specifically, they are the closest to the floor
- [ ] Colour never carries meaning alone — every state has a glyph (`CircularState`) **and** a text
      description. A verified row says "Valid for 87 more days"; a failed row states the fix
- [ ] Each row is a real `<button>` (`ListItem` renders one) with
      `aria-label="Selfie Check — Reporting — not started"`, updated per state
- [ ] Drawer is `role="dialog"` with `aria-labelledby` on `DrawerTitle`; focus moves to the drawer
      on open and returns to the originating row on close (kit handles; verify on device)
- [ ] `aria-live="polite"` on the row status region so "Verifying…" → "Verified" is announced
      without stealing focus
- [ ] `aria-live="assertive"` on exactly two events: verification succeeded, and terminal denial.
      Nothing else — over-using assertive turns it into noise
- [ ] Loading `Skeleton` region carries `aria-busy="true"` and `aria-label="Loading verification status"`
- [ ] Failure copy states the fix ("Hold the phone flat against the back cover"), never the code
      name (`verification_rejected` must never reach the screen)
- [ ] Tab order: header → row 1 → row 2 → row 3 → Continue. In-drawer: title → primary → dismiss
- [ ] Focus visible on every control; do not override the kit's ring
- [ ] `prefers-reduced-motion` honoured (kit default; add no custom motion)

---

## 11. Developer Notes

1. **Generalise the existing component, don't write a new one.**
   `src/components/Verify/index.tsx` is already the exact request/verify flow. Only line 46
   varies per method. Extract:

   ```ts
   // src/lib/verify-with-preset.ts
   export async function verifyWithPreset(preset: Preset, action: string) { /* lines 17–77, verbatim */ }
   ```

   The hub calls it three times. Everything else in that file — the RP-signature fetch, the
   `pollUntilCompletion`, the `/api/verify-proof` POST — is reused unchanged. This is most of
   the 45-minute budget saved.

2. **Use the three *legacy* presets, all under one request config.**

   ```ts
   import { selfieCheckLegacy, secureDocumentLegacy, orbLegacy } from '@worldcoin/idkit';
   ```

   Verified in `@worldcoin/idkit-core`: `orbLegacy`, `secureDocumentLegacy` and
   `selfieCheckLegacy` are all documented with `allow_legacy_proofs: true`. The `passport()`
   preset is the World ID **4.0** variant and its own docstring uses
   `allow_legacy_proofs: false`. Mixing them means two different `IDKit.request` configs. **Use
   `secureDocumentLegacy` for the Passport row** so all three share one code path. If the team
   later needs 4.0 semantics, that is a separate, deliberate change.

3. **Three distinct `action` strings, and they must exist in the Developer Portal.**
   Suggest `verify-selfie`, `verify-passport`, `verify-orb`. A missing action returns
   `unknown_rp` / `malformed_request` and the row shows "Verification is misconfigured".
   **Create these before building the UI** — otherwise every row fails and it looks like a UI bug.
   Use the `world-developer-portal` MCP `create_world_id_action`.

4. **`signal`.** Currently `''` (Verify/index.tsx:46). Leave it for the hackathon. Binding the
   proof to `session.user.walletAddress` is correct long-term but the same signal must be used
   server-side, and `/api/verify-proof` currently just forwards the payload. Record as debt; do
   not change it under time pressure.

5. **Persistence — there is no database (DEBT-001).** The hub needs to read held credentials on
   mount. Smallest honest option, ~15 min:

   ```
   GET  /api/verification-status        → Credentials (from tiers.ts)
   POST /api/verify-proof               → on success, record { method, verifiedAt } for this wallet
   ```

   Back it with a module-level `Map<walletAddress, Credentials>` in a `src/lib/credential-store.ts`.
   It survives page reloads (which is what the demo needs) and is lost on redeploy (which is
   acceptable and must be written down). Do **not** use `localStorage` — a client-writable tier is
   not a tier, and `requireCapability` reads server-side anyway.

6. **`tierFor()` Orb-alone fix is a prerequisite** — see §1.1. One line. Without it the Orb row's
   promise is false.

7. **`ACCESS_ENFORCEMENT` is off** (`policy.ts`). While off, everything is open regardless of
   tier. The hub must still show the true tier — it is describing the policy, not the current
   runtime. Do not add "(not yet enforced)" to the UI; that is internal state and it undermines
   the screen's whole purpose.

8. **Nationality attestation is NOT in this batch.** `tiers.ts` requires
   `passport.nationalityAllowed === true` for `VERIFIED`, and that boolean comes from an
   `identityCheck` request with a declared nationality (see `src/lib/access/allowlist.ts`) — a
   second flow with its own country picker. `secureDocumentLegacy` alone proves the document, not
   the nationality. **Consequence for this batch**: the Passport row grants a document credential
   only, and `nationalityAllowed` cannot honestly be set to `true`. Either (a) ship the Passport
   row with §4.3's footnote and set `nationalityAllowed` from a follow-up Identity Check batch, or
   (b) have the CTO decide an explicit demo stub. **Do not silently hardcode `true`** — the copy
   in §5.5 stops being true the moment someone does. This is the top open question.

9. **`ListItem` gotchas**: `description` is `truncate` — one clipped line, ≤34 chars. It accepts no
   `className`/`style` (both omitted from its props type), so state colour goes on the adornments,
   not the text. It is already a filled rounded surface — never wrap it in another card.

10. **`CircularState` accepts** `success | error | warning | pending | critical`. `critical` is
    unused on this screen; `pending` is unused too — use `Spinner` for in-flight, since it conveys
    motion and `CircularState pending` is static.

11. **Eruda is wired** (`src/providers/Eruda/`). It is the only way to read IDKit errors on device.
    Log the raw `completion.error` there and map to §5.3 copy for display — never render the code.

12. **Poll cleanup**: abort `pollUntilCompletion` on unmount and on drawer dismiss. A left-running
    poller after the user backs out is a battery and rate-limit problem.

13. **Do not re-derive tiers in the client.** The hub fetches `Credentials` and calls the existing
    `tierFor()` / `explain()` — it does not compare credentials inline. Everywhere else in the app,
    locked UI renders from `explain()`'s `AccessDecision` (§5.6). One switch on `decision.reason`,
    three cases, no hand-written lock copy anywhere.

14. **Gate the Orb row on `credentials.passport?.nationalityAllowed === true`**, not on
    `credentials.passport !== undefined`. A user whose passport was attested *false* must not be
    shown an Orb path — their ceiling is fixed, and offering Orb would invite pointless travel.
    (§1.1, §5.5.)

15. **`TIER_LABELS` / `TIER_REQUIREMENTS` are engine strings, not UI strings** (§1.2). Add
    `TIER_ROLE` and a capability-name map in one file next to the hub. If anyone renders "Basic"
    to a user, that is a review blocker — it is the exact word §3 exists to eliminate.

---

## 12. Open Questions

1. **Nationality attestation (§11.8)** — blocking for any honest claim that Passport unlocks
   taskings. Needs a CTO decision this session: ship the Identity Check step, or ship the Passport
   row with scoped copy that does not promise taskings.
2. **Surface conflict (§0.1)** — is MilFi a Mini App, a web console, or both? Two specs now exist
   with opposite answers on the UI kit. Someone must decide before either is built.
3. **Selfie Check availability** — its docstring says "currently in preview. Contact us if you
   need it enabled." If it is not enabled for `app_3e54fa415d153fbd5fd72033452b27f8`, the Selfie
   row lands permanently in the Unavailable state — and it is the row that matters most to field
   operators. Worth confirming against the portal **before** the demo, not during it.
4. **Does World App's webview honour `target="_blank"`** for the "Where are the Orbs?" link, or is
   a MiniKit external-link command required? Low stakes; the row works without it.

---

## Next Steps

- [ ] CTO: decide open question 1 (nationality attestation) — blocks Passport row copy
- [ ] CTO: decide open question 2 (surface) — this spec vs. `milfi-identity-ui-spec.md`
- [ ] Apply the `tierFor()` Orb-alone fix (§1.1) — one line, prerequisite
- [ ] Apply the `color-scheme: light` fix (§6.2) — two minutes, prevents a dark-mode demo failure
- [ ] Create the three World ID actions in the Developer Portal (§11.3) before UI work starts
- [ ] Confirm Selfie Check is enabled for this app ID (open question 3)
- [ ] Then implement: `verify-with-preset.ts` → `credential-store.ts` + status route → `labels.ts`
      (`TIER_ROLE` + capability names) → hub screen + one drawer
- [ ] Separately (not in this batch): `LockedPanel` consuming `AccessDecision` (§5.6) — it is what
      makes every other screen's locked state correct by construction

---

**Exit checklist note**: no `git commit` was run — the human wants to review first, per the task
instruction. `.claude/sprints/current.md` and `.claude/workflows/NOTIFICATION_LOG.md` were updated.
