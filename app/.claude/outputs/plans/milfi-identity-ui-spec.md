# UI/UX Spec: MilFi — World Identity Layer (Verification, Clearance, Authorization)

**Date**: 2026-07-25
**Agent**: ui-ux-specialist
**Status**: COMPLETE
**Scope**: World layer ONLY — identity, verification, authorization, agent attribution.
Storage internals (0G) and payment/settlement internals (Hedera) are partner-owned; this spec
defines only the **seams**.
**Surface**: Web platform (World ID `external` app + IDKit). **Not** a World App Mini App.

---

## 0. Summary

MilFi is a defence command-and-control prototype in which **verification level IS the access
control**. A user's World ID credential set determines, with no separate roles table, what they
are permitted to do: observe, be tasked, or authorize force.

This spec covers seven surfaces:

1. Verification onboarding per actor (desktop QR + mobile deep link)
2. The clearance ladder and the "insufficient clearance" state
3. The nationality-denial state
4. Threat report submission with live camera proof capture
5. The tasking authorization decision screen (highest stakes in the product)
6. Agent identity surfacing (AgentKit human-backing)
7. All failure modes

It also records four **design decisions the team must ratify** (Section 1) and a **persistence
manifest** handed to the 0G layer (Section 12).

---

## 1. Design decisions requiring team ratification

These are real calls, not defaults. Each states its reasoning because the team needs to be able
to disagree with the reasoning, not just the conclusion.

### DECISION 1 — Do NOT install `@worldcoin/mini-apps-ui-kit-react`

**Verdict: reject the kit for this product.**

`instructions/design.md` opens with "The platform sets the visual language, not you… use the kit
before writing custom UI." That rule is correct **for a Mini App**, and it is written on the
assumption of a phone-sized webview inside World App. Every premise behind it fails here:

| Kit premise | Reality on MilFi |
|---|---|
| Renders inside World App's chrome; looking native builds trust | Renders in Chrome/Safari at 1440px+. Looking like a consumer crypto wallet *reduces* trust in a C2 tool |
| `SafeAreaView`, `TopBar`, `BottomBar` are the page frame | No notch, no home indicator. We need a three-zone workstation layout the kit has no primitives for |
| `Haptic`, `Toast`, `LiveFeedback` bridge to MiniKit | **MiniKit is absent.** These components are inert or throw outside World App |
| One column, thumb reach, interruption-tolerant | Dense multi-pane, mouse+keyboard, sustained attention |
| Ships its own `globals.css`, font stack and token set | Would fight the app's own `globals.css` — a conflict design.md itself warns about (line 118–122) |

**Adopt instead**: `@worldcoin/idkit` (required and framework-agnostic — this is the actual World
dependency) + a thin in-repo component layer on **Tailwind v4**, built to the structural rules in
design.md: four states per screen, spacing scale discipline, one accent one meaning, restraint
over decoration, the full accessibility checklist. We keep design.md's *discipline* and drop its
*Mini App chrome*.

`iconoir-react` stays — it is already a dependency, it is a hairline stroke set, and hairline
strokes are exactly right for instrument UI.

**Consequence to own**: we lose `VerificationBadge` for free. Section 6 specifies our replacement,
the Clearance Chip, which has to carry more information than the kit's badge anyway (three tiers,
not verified/unverified).

### DECISION 2 — Reassign the palette; interactive affordance becomes achromatic

design.md's inherited palette is a marketing palette. `--accent: #FF4D2E` is a CTA orange-red.
In a defence C2 interface, **red is the threat channel and nothing else**. A red "Submit" button
next to a red "Chemical threat" badge is a legibility failure with real consequences.

Resolution: **all colour becomes semantic, and interactivity is signalled achromatically** —
primary action = solid light fill, secondary = hairline outline, destructive = threat red. This
frees the entire chromatic range for meaning and eliminates the collision. Full tokens in Section 8.

### DECISION 3 — Drop Clash Display; promote JetBrains Mono to a first-class role

Clash Display is a display face with high stroke contrast and tight apertures — designed to be
looked at, not read. It is also a face of the moment, which fails the persona's timeless-over-trendy
test. Replace headline duty with **Satoshi Bold at −0.02em tracking**.

Then the load-bearing move: **every numeric or identifier value renders in JetBrains Mono with
`font-variant-numeric: tabular-nums`.** Coordinates, speed, ETA, timestamps, wallet addresses,
content hashes, nullifiers, human identifiers. Prose in Satoshi, data in mono, no exceptions. This
single rule does more to make the product read as instrument-grade than any amount of styling, and
tabular figures stop values jittering as they tick.

### DECISION 4 — No pure white text

design.md's anti-pattern list forbids `#FFF`; the agent quick-reference sets `--text-primary:
#ffffff`. They conflict. **Resolve toward the anti-pattern list**: `--text-primary: #F2F2F5`.
On a `#0a0a0f` canvas that is 17.4:1 — far above requirement — while avoiding the halation that
makes pure white on near-black fatiguing over a long workstation session. This product is
designed to be stared at.

---

## 2. Actors, credentials, capabilities

The single source of truth. This table is rendered as a UI component (Section 6), not just
documented — a user must be able to read their own position on the ladder at any time.

| Tier | Label | Credential required | Grants | Explicitly denied |
|---|---|---|---|---|
| **T0** | `UNVERIFIED` | none | View public map, view own clearance ladder | Everything else |
| **T1** | `OBSERVER` | **Selfie Check** (device camera, liveness, 90-day validity) | Submit threat report with photo proof; view own reports | Be tasked; view other units' reports; any funds action |
| **T2** | `OPERATOR` | **Passport (Identity Check)** with `nationality ∈ allow-list` → `identity_attested: true` | Everything in T1 + accept taskings, submit strike proof, receive payment | Adjudicate reports; authorize taskings; release funds |
| **T3** | `COMMAND` | **Passport (Identity Check) + Orb (Proof of Human)** | Everything in T2 + verify reports, authorize taskings, release payment | — |

**Non-negotiable facts the UI must never contradict:**

- **Orb returns no nationality.** It is anonymous proof of unique humanity. Nationality derives
  only from the passport credential. Orb therefore **stacks on top of** passport at T3 — it never
  substitutes for it. The ladder UI must render T3 as `Passport + Orb`, never as `Orb`.
- **Identity Check returns a boolean.** We ask "is this document's nationality within the
  permitted set?" and receive `identity_attested: true|false`. **We never receive the nationality.**
  Every string of copy in the product must be consistent with that. Any phrasing that implies we
  hold the user's document is both false and a trust breach — see Section 5 copy deck.
- **Country policy is an ALLOW-LIST.** Permitted nations pass; everything else is denied by
  default. The UI never displays the list (it is policy, and displaying it turns the app into a
  policy-disclosure oracle).
- **Selfie Check and Identity Check are in beta.** Every entry point to them carries a `BETA`
  pill. Not decoration — it sets the user's expectation before a beta SDK fails on them.

### Capability model for developers

```ts
type Tier = 'T0' | 'T1' | 'T2' | 'T3'

type Capability =
  | 'report.submit' | 'report.viewOwn' | 'report.viewAll' | 'report.adjudicate'
  | 'tasking.accept' | 'tasking.authorize'
  | 'proof.submitStrike'
  | 'payment.receive' | 'payment.release'
  | 'agent.register'

// Single source of truth. UI reads ONLY from here. Never hand-check a tier at a call site.
const GRANTS: Record<Tier, Capability[]> = { /* per table above */ }
```

**Rule for implementers**: no component may branch on tier directly. Components ask
`can('tasking.authorize')` and receive `{ allowed: boolean, missing: Credential[] }`. The
`missing` array is what renders the locked state in Section 4 — which means the locked state can
never drift out of sync with the grant table.

---

## 3. Verification onboarding — user flow

### 3.1 Master flow

```
[Landing /]  T0 — map visible, all actions locked
     │
     ▼
[Clearance panel — "You are UNVERIFIED"]
     │  user picks a target tier
     ▼
[Pre-consent screen  /verify/:credential]   ← REQUIRED. See 3.2
     │  "Continue"
     ▼
┌──────────────────────────── device split ────────────────────────────┐
│ DESKTOP (≥768px)                      │ MOBILE (<768px)              │
│ [QR panel /verify/:cred]              │ [Deep-link button]           │
│   status: Waiting for scan            │   → World App opens          │
│   ├─ scanned ──► Continue on phone    │   ├─ returns w/ result ──┐   │
│   ├─ expired ──► [QR EXPIRED] ─┐      │   ├─ returns empty ──────┼─► │
│   └─ abandoned ► [Resume card] │      │   └─ never leaves ───────┘   │
│                  └─ regenerate ┘      │      (no World App)          │
└──────────────────────────────────────────────────────────────────────┘
     │
     ▼
[handleVerify → POST /api/verify-proof]  server-side proof validation
     │
     ├── 200 + identity_attested:true ──► [Tier granted]
     │                                        │
     │                                        ▼
     │                                   [Agent registration — AgentKit]  see 3.5
     │                                        ├── ok ──► [Operations console]
     │                                        └── fail ► [Agent unregistered banner]
     │                                                     (tier retained, agent actions locked)
     │
     ├── 200 + identity_attested:false ─► [CLEARANCE DENIED]   see Section 5
     │                                        └─► only path: remain / become OBSERVER
     │
     ├── liveness failed ───────────────► [Retry — new user]  or
     │                                    [Re-enrol required — returning user]
     │
     ├── nullifier already used ────────► [Credential already bound to another account]
     │
     └── network / 5xx ─────────────────► [Verification unavailable — retry]
```

### 3.2 Pre-consent screen — REQUIRED before every credential request

This screen is not optional politeness. The Identity Check track explicitly requires the app to
explain *why* an attribute is necessary and *how* data collection is minimised. This is where we
do that, in the user's path, at the moment of decision.

Route: `/verify/:credential`. Single centred column, `max-width: 560px`.

```
┌──────────────────────────────────────────────────────┐
│  PASSPORT VERIFICATION                    [BETA]     │
│  Required for: OPERATOR clearance                    │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  WHAT MILFI ASKS                                     │
│  ▸ Is the nationality on your document within        │
│    MilFi's permitted-nation list?                    │
│                                                      │
│  WHAT MILFI RECEIVES                                 │
│  ▸ Yes or no.                                        │
│                                                      │
│  WHAT MILFI DOES NOT RECEIVE                         │
│  ▸ Your nationality        ▸ Your name               │
│  ▸ Your document number    ▸ Your date of birth      │
│  ▸ Any image of your document                        │
│                                                      │
│  Your document never leaves World App. World ID      │
│  answers the question; MilFi only sees the answer.   │
│                                                      │
│  WHY MILFI ASKS                                      │
│  Strike units can be issued taskings. Only nationals │
│  of permitted nations may hold that authority.       │
│                                                      │
│  [ Continue ]        [ Not now ]                     │
└──────────────────────────────────────────────────────┘
```

Copy discipline: three literal column headings — **asks / receives / does not receive**. The
negative list is longer than the positive list and that asymmetry is the point. Do not soften it
into a paragraph; a scannable list is what a wary user actually reads.

Selfie Check variant substitutes:
- ASKS — "Is a live person present, and are they the same person as before?"
- RECEIVES — "Yes/no, plus a similarity signal indicating duplicate-account risk."
- DOES NOT RECEIVE — "Your photo. MilFi never stores a selfie or a face template."
- WHY — "Reports carry weight. A live human must stand behind each one."
- Plus: **"Valid for 90 days, then re-verify."** State the expiry *before* they start, not when
  it lapses.

### 3.3 Desktop QR panel — the drop-off surface

The single highest-drop-off step in the product: a desktop user is asked to pick up a phone,
open an app they may not have, and scan. Design accordingly.

**Layout — two columns, not a modal.** A dimmed modal (a) is a design.md anti-pattern, (b) hides
the instructions the user needs while their head is down at their phone, (c) is dismissable by
stray Escape mid-scan. This is a route.

```
┌───────────────────────────────┬────────────────────────────────────┐
│                               │  1  Open World App on your phone   │
│      ┌─────────────────┐      │     Don't have it? ▸ Get World App │
│      │                 │      │                                    │
│      │    [QR CODE]    │      │  2  Tap the scan icon, top right   │
│      │     280×280     │      │                                    │
│      │                 │      │  3  Point it at this code          │
│      └─────────────────┘      │                                    │
│                               │  Nothing is sent to MilFi until    │
│   ● Waiting for scan…         │  you approve it on your phone.     │
│   Code expires in 4:32        │                                    │
│                               │  [ Use this phone instead ]        │
│   [ Cancel ]                  │                                    │
└───────────────────────────────┴────────────────────────────────────┘
```

**The status stepper is the anti-drop-off device.** A QR that never visibly reacts makes people
re-scan, then give up. Four states, `aria-live` announced:

| Status | Indicator | Label | Sub-label |
|---|---|---|---|
| `waiting` | slow-pulse dot, `--text-muted` | Waiting for scan… | Code expires in M:SS |
| `scanned` | solid dot, `--sig-info` | Scanned — continue on your phone | Approve the request in World App |
| `verifying` | 2px indeterminate bar | Verifying proof… | This takes a few seconds |
| `granted` | filled check, `--sig-verified` | Verified | Clearance updated |

**The `waiting → scanned` transition must render within 1s of the scan event.** It is the whole
reason the user believes the system is working. If IDKit does not expose a scan-received event
before proof completion, treat that as a **blocking question for the CTO** — worst case, we
optimistically transition on the first polling response that indicates session pickup.

**Expiry.** Show remaining time as **text** (`Code expires in 4:32`), not only a shrinking ring —
a ring alone is unreadable at a glance and inaccessible. Below 60s the label switches to
`--sig-caution` **and** prefixes a `!` glyph (never colour alone). On expiry, replace the QR
canvas — do not blur it (blur reads as glassmorphism, and a half-visible QR invites a doomed scan):

```
┌─────────────────┐
│  ╱             ╲│
│  This code      │   "This code expired for your security."
│  expired        │   [ Generate new code ]
│  ╲             ╱│
└─────────────────┘
```

**Never auto-regenerate.** If the user is mid-scan and the code silently swaps, their scan fails
with no explanation — the worst possible failure. Explicit button only.

**"Get World App" is a disclosure, not a second QR side-by-side.** Two QRs in one viewport
guarantees someone scans the wrong one. Clicking the link collapses the verification QR and
replaces it with the install QR under an unmistakable heading — one QR visible at any moment,
ever.

### 3.4 Mobile deep-link variant

Same route, `<768px`. QR replaced by a single full-width primary button pinned to a sticky bottom
action bar: **`Continue in World App`**. Uses IDKit's `return_to`.

The hard case is the **silent return** — the user backgrounds MilFi, does something else, and
comes back with no result. We cannot distinguish that from a decline.

```
on visibilitychange → visible:
  if (no result received) →
    render "Didn't finish in World App?" card:
      [ Try again ]  [ Use a computer instead ]  (shows QR + shareable link)

after tap, if document never blurred within 2500ms →
  assume World App is not installed →
    render install card:
      "World App didn't open. It may not be installed on this phone."
      [ Get World App ]  [ Try again ]
```

Never dead-end, never blame the user, always offer a second route.

### 3.5 Agent registration (AgentKit) — the step after clearance

Verification alone does not complete onboarding. Each verified user is issued an agent + wallet
registered through AgentKit, linking that agent wallet to an **anonymous human identifier**. That
link is the product's whole claim — an agent backed by a real, unique, verified human.

Placed immediately after tier grant, on the success screen, as a distinct second step so the user
understands two different things happened:

```
  ✓  Clearance granted — OPERATOR
     Passport verified · nationality attested

  ◐  Registering your agent…
     Linking agent wallet 0x7a3f…9d21 to your verified identity
```

On success it becomes the Agent Identity Card (Section 6.3). On failure, Section 7 case 8:
**the tier is retained**, only agent-dependent capabilities lock. Never roll back a hard-won
verification because a downstream registration failed.

---

## 4. The clearance ladder and the "insufficient clearance" state

### 4.1 Clearance ladder component

Persistent, in the left rail on desktop and the `Clearance` tab on mobile. Always answers three
questions in fixed order: **what am I / what does it unlock / what do I do to climb.**

```
CLEARANCE                                    ┌ current tier marker
──────────────────────────────────────────
│●│ T3  COMMAND            Passport + Orb
│ │     Authorize taskings · Verify reports · Release payment
│ │     ▸ Requires: Orb (Proof of Human)          [ Add credential ]
├─┤
│●│ T2  OPERATOR           Passport             ◀── YOU ARE HERE
│ │     Accept taskings · Submit strike proof · Receive payment
├─┤
│●│ T1  OBSERVER           Selfie Check      ✓ held · expires in 87 days
│ │     Submit threat reports
──────────────────────────────────────────
```

Rules:
- **Fixed vertical order, highest at top.** The ladder never reorders — spatial memory matters
  when the same component is on screen all session.
- Tiers held: filled marker, full-contrast text, `✓ held`.
- Current tier: `◀── YOU ARE HERE` **plus** a 2px left rule. Position is stated in text, not
  implied by colour.
- Tiers above: hollow marker, `--text-secondary` body, and — critically — **capabilities remain
  fully legible**. Do not fade unreached capabilities into unreadability. In a C2 tool, knowing
  the full shape of the system is itself operational information.
- Every unreached tier ends with a literal `▸ Requires:` line naming the exact credential, and
  one button. Never "Upgrade", never "Unlock more" — consumer-product language, wrong register.
- Selfie tier shows a live 90-day countdown once held.

### 4.2 The locked-action state — the most-seen state in the product

Design principle: **show the action, disable the action, name the missing credential, offer the
path.** Never hide a locked action (the user can't form a mental model of a system whose shape
changes per user). Never route a locked action to a modal (design.md anti-pattern; also punishes
a mis-click with a dismissal task).

Three renderings, by context:

**(a) Locked button** — inline, in place.

```
┌──────────────────────────────────────────────┐
│ 🔒 Accept tasking                            │   ← disabled, --text-muted,
│    Requires OPERATOR · Passport verification │      2px left rule --sig-caution
│    [ Verify passport → ]                     │      inner link IS focusable
└──────────────────────────────────────────────┘
```

The outer control is `aria-disabled="true"` (**not** `disabled`) so it stays keyboard-reachable
and its explanation stays screen-reader-discoverable. A truly `disabled` element is invisible to
a screen-reader user, who then has no idea why they cannot proceed. The inner `Verify passport →`
link is a real focusable control.

**(b) Locked list section** — e.g. other units' reports at T1.

```
────────────────────────────────────────────
  OTHER UNITS' REPORTS
  🔒 Visible at COMMAND clearance
     Requires: Passport + Orb (Proof of Human)
     [ View requirements ]
────────────────────────────────────────────
```

Show the section heading and the count if non-sensitive (`3 reports`); never the contents, never
a blurred preview of contents. Blurred-content teasers are a growth-hack pattern and a data-leak
risk — an image blur is reversible.

**(c) Locked route** — direct URL hit on `/tasking/:id/confirm` at T2.

Full-page, no redirect (a silent redirect destroys the user's sense of place). Renders the
clearance ladder with the required tier highlighted, plus `Return to console`.

**Copy formula, used verbatim everywhere:**

> `🔒 [Capability] requires [TIER] clearance.`
> `Requires: [exact credential name].`
> `[ Verify → ]`

One formula, every instance. Users learn to parse it once.

---

## 5. The denial state — `identity_attested: false`

The hardest screen in the product to get right. Four simultaneous constraints:
**unambiguous · non-negotiable · non-leaky · not accusatory.**

### 5.1 Visual treatment

Deliberately restrained. A full-bleed red panel with a warning triangle reads as *accusation* —
as though the user did something wrong. They did not; a policy did not match. Treatment:

- Standard card on `--bg-card`, **2px left rule in `--sig-threat`** — the only red on screen.
- Icon: `iconoir` `Prohibition` at 20px, inline with the heading, `--sig-threat`.
- No alarm animation, no shake, no sound. Motion here is punitive.
- Card sits **in the page**, not in a modal. A modal implies "dismiss and try again"; this is not
  dismissable, because the outcome is not negotiable.

### 5.2 Copy deck — use verbatim

```
◼ Clearance not granted

  Your document was checked against MilFi's permitted-nation list.
  The check returned no match.

  MilFi received a yes-or-no answer only. We did not receive — and
  cannot store — your nationality, your name, your document number,
  or any image of your document. That check happened inside World App.

  This outcome is final for this deployment.

  OBSERVER clearance remains available to you. It requires only a
  Selfie Check and allows you to submit threat reports.

  [ Continue as OBSERVER ]        [ Return to console ]
```

Line-by-line rationale — each sentence is load-bearing:

| Line | Why it is there |
|---|---|
| "checked against MilFi's permitted-nation list" | Names the mechanism. Vagueness invites the user to assume something worse (fraud suspicion). |
| "returned no match" | Neutral, mechanical. Not "you are not permitted", not "denied". The list did not match; nobody judged them. |
| "yes-or-no answer only" | The Identity Check honesty requirement. Answers the fear the screen creates: *what did they just take from me?* |
| "cannot store" | Stronger than "do not store", and true — we never receive it. Assert only what is architecturally true. |
| "That check happened inside World App" | Locates the data. The user's document stayed on their device. |
| "final for this deployment" | Non-negotiable, and honest about scope: this policy, this deployment — not a permanent judgment on the person. |
| "OBSERVER remains available" | Never dead-end. A real, achievable path is the difference between a policy outcome and a rejection. |

**Forbidden copy** — any of these is a spec violation:
- Naming or hinting at any country, permitted or not
- "unfortunately", "we're sorry" — false sympathy for a deterministic policy check
- "contact support", "appeal" — no such process exists; do not invent one
- "try a different document" — invites document-shopping and turns MilFi into a probing oracle
- Anything implying MilFi possesses, reviewed, or retained the document

### 5.3 Anti-oracle rate limit (behavioural, needs backend)

An attacker with several passports could use repeated Identity Checks to enumerate the allow-list.
**Cap: one Identity Check attempt per World ID nullifier per 24h.** No retry control on the denial
screen at all. Attempting again within the window:

> `Identity check unavailable — next attempt available in 21h 14m.`

Flag to CTO: enforced server-side; a client-only limit is decorative.

---

## 6. Agent identity surfacing (AgentKit)

The prize thesis and the product thesis are the same: a service can tell the difference between
a bot and an agent acting for a real, unique, verified human. If that is buried in a settings
page, the product does not demonstrate its own claim. It appears **on every artefact an agent
produces**.

### 6.1 Agent Attribution Chip — the atom

Inline, 28px tall, appears on every agent-authored item: analysis results, recommendations,
activity-log lines.

```
◆ EthGlobal Analysis Agent · HUMAN-BACKED · 0x9f4a…3c21 ▸
```

- `◆` filled diamond in `--sig-info`. Diamond = machine origin, used **nowhere else**. Human
  actions carry no diamond.
- `HUMAN-BACKED` in mono uppercase, 11px, `--sig-verified`, with a 1px verified-tint border.
  Text label, not a bare coloured dot — colour alone is never sufficient.
- Wallet address truncated in mono.
- `▸` expands to the full card.

### 6.2 Unbacked agent — the counter-example, which must be visible

If an agent is unregistered or its registration cannot be resolved:

```
◇ Unattributed agent · NOT HUMAN-BACKED · unregistered
```

- Hollow diamond, `--sig-caution`.
- Its output block renders with a **dashed** hairline instead of solid, and its content sits at
  `--text-secondary`.
- **Its recommendations cannot be acted upon** — the Authorize control is locked with
  `Requires: human-backed agent attribution`.

This contrast is worth building even though the demo path never hits it. Showing the system
*refusing* an unbacked agent is the clearest possible demonstration of what AgentKit buys. Include
a demo toggle to force this state.

### 6.3 Agent Identity Card — expanded

Opens as an inline disclosure below the chip (not a modal — the user needs the agent's output on
screen while inspecting its provenance).

```
┌────────────────────────────────────────────────────────────┐
│ ◆ EthGlobal Analysis Agent                    HUMAN-BACKED │
│ ────────────────────────────────────────────────────────── │
│ Agent wallet      0x9f4a2b7c…d33c21          [copy]        │
│ Chain             eip155:8453                              │
│ Registered        2026-07-25 14:02:11 UTC                  │
│ ────────────────────────────────────────────────────────── │
│ HUMAN BACKER                                               │
│ Identifier        hid:0x4a7e…21e7            [copy]        │
│ Clearance         T3 COMMAND                               │
│ Credentials       Passport · Orb (Proof of Human)          │
│ ────────────────────────────────────────────────────────── │
│ This identifier is pseudonymous. It proves that one        │
│ unique, verified human stands behind this agent. It does   │
│ not reveal who that person is, and it cannot be linked to  │
│ them outside MilFi.                                        │
└────────────────────────────────────────────────────────────┘
```

That closing paragraph is mandatory and must not be shortened. Without it, a reader assumes
`hid:0x4a7e…21e7` is a de-anonymised person handle — the exact opposite of what World ID provides.

### 6.4 Placement rules

| Location | Rendering |
|---|---|
| Activity log entry | Chip, inline, before the message |
| Report verification result | Chip in the result card header |
| Tasking recommendation | **Full card, always expanded, never collapsed** — highest stakes |
| Unit roster | Chip under each unit's operator name |
| Own agent, after onboarding | Full card on the success screen |

---

## 7. Screen states — complete matrix

### 7.1 Verification screens

| Screen | State | Visual | User can | Component |
|---|---|---|---|---|
| Pre-consent | Default | Centred card, three-column disclosure, BETA pill | Continue / Not now | `ConsentCard` |
| QR panel | `waiting` | QR 280px, pulse dot, `Expires in M:SS` | Cancel, switch to phone, get World App | `QrPanel` + `StatusStepper` |
| QR panel | `scanned` | Info dot solid, label swap, QR dims to 40% | Cancel | `StatusStepper` |
| QR panel | `verifying` | Indeterminate 2px bar under QR; QR hidden | Cancel | `ProgressBar` |
| QR panel | `expired` | QR replaced by bordered notice | Generate new code | `ExpiredNotice` |
| QR panel | `abandoned` (10 min, no scan) | Panel collapses to a resume card, timer stops | Resume, exit | `ResumeCard` |
| Deep link | `idle` | Full-width sticky primary button | Continue in World App | `DeepLinkBar` |
| Deep link | `returned-empty` | "Didn't finish?" card | Try again, use a computer | `RecoveryCard` |
| Deep link | `no-app` | Install card after 2.5s no-blur | Get World App, try again | `InstallCard` |
| Result | `granted` | Check mark, tier name, then agent-registration row | Continue to console | `GrantCard` |
| Result | `denied` | Section 5 treatment | Continue as OBSERVER, return | `DenialCard` |
| Result | `liveness-failed-new` | Caution rule, retry guidance (lighting, remove glasses, hold steady) | Retry (max 3), then cool-down | `RetryCard` |
| Result | `liveness-failed-returning` | Caution rule, re-enrolment explanation | Contact deployment admin, continue at current tier | `ReenrolCard` |
| Result | `nullifier-used` | Neutral notice: credential already bound to another MilFi account | Sign in as that account, return | `ConflictCard` |
| Result | `network-error` | Neutral, no red — our fault, not theirs | Retry, return | `SystemErrorCard` |

### 7.2 Console / operations screens

| Screen | State | Visual | User can | Component |
|---|---|---|---|---|
| Console | Empty (T1, no reports) | Map + "No reports submitted. Incoming signals appear here." | Await signal, open clearance | `EmptyState` |
| Console | Loading | Skeleton rows in log, map at 60% opacity with `Loading units…` | Nothing | `Skeleton` |
| Console | Active | Map with unit markers, live activity log | Per clearance | `MapPane`, `ActivityLog` |
| Console | Credential expiring (≤14d) | Caution band above content, dismissable per session | Re-verify, dismiss | `ExpiryBand` |
| Console | Credential expired | Threat-rule band, **not** dismissable; dependent actions lock | Re-verify | `ExpiredBand` |
| Console | Agent unregistered | Caution band: "Your agent is not registered. Agent actions unavailable." | Retry registration | `AgentErrorBand` |
| Report form | Empty | Prefilled from signal, empty camera well | Capture, edit fields | `ReportForm` |
| Report form | Camera requesting | Well shows "Requesting camera access…" + spinner | Cancel | `CameraWell` |
| Report form | Camera denied | Well shows permission-recovery instructions per browser | Follow steps, retry, cancel report | `CameraDeniedWell` |
| Report form | Camera live | Live viewfinder, 64px capture button, `● LIVE` mono badge | Capture, cancel | `CameraWell` |
| Report form | Photo captured | Still frame, capture timestamp in mono | Retake, accept | `CapturePreview` |
| Report form | Submitting | Fields lock, "Storing proof…" (0G seam) | Nothing | `ProgressBar` |
| Report form | Submitted | Success card, 0G reference + hash in mono, copy button | View report, return | `ReceiptCard` |
| Report form | Storage failed | Photo held in memory, "Proof storage unavailable" | Retry (photo preserved), discard | `StorageErrorCard` |
| Confirm tasking | Awaiting review | Section 9 | Review, authorize, decline | `TaskingDecision` |
| Confirm tasking | Acks incomplete | Authorize control locked, `0 of 3 acknowledged` | Tick acks, decline | `AckGate` |
| Confirm tasking | Holding | Progress rule fills the control, `Hold…` | Release to cancel | `HoldToConfirm` |
| Confirm tasking | Authorized | Control replaced by attribution receipt | Copy receipt, return | `AuthReceipt` |
| Confirm tasking | Declined | Neutral state, reason recorded, receipt | Return | `DeclineReceipt` |
| Confirm tasking | Superseded | Locked, "Actioned by another operator at HH:MM:SS" | Return | `SupersededCard` |

### 7.3 Failure-mode index — required coverage

| # | Failure | Detection | Treatment | Recovery |
|---|---|---|---|---|
| 1 | Verification abandoned | No scan for 10 min | QR panel collapses to resume card; polling stops | Resume (new code) |
| 2 | QR expired | `expires_at` reached | QR replaced by notice — never blurred, never auto-refreshed | Generate new code |
| 3 | World App not installed | Desktop: user says so. Mobile: no `blur` within 2500ms of deep link | Install card, single QR / store link | Install, then retry |
| 4 | Liveness failure — new user | IDKit error | Retry card with three concrete tips | Retry, max 3, then 15-min cool-down |
| 5 | Liveness failure — returning | Face auth mismatch | Cannot proceed; re-enrolment explained plainly | Continue at current tier |
| 6 | Selfie credential expired (90d) | `expires_at` in session record | Non-dismissable band; `report.submit` locks | Re-verify Selfie Check |
| 7 | `identity_attested: false` | Verify response | Section 5 | Continue as OBSERVER only |
| 8 | Camera permission denied | `getUserMedia` `NotAllowedError` | In-well recovery steps, browser-specific | Grant, retry; no upload bypass |
| 9 | Agent registration failure | AgentKit error | Caution band; **tier retained**, agent actions locked | Retry (exponential backoff) |
| 10 | Nullifier already used | Verify response | Neutral conflict card | Sign in as bound account |
| 11 | RP signature expired / clock skew | 400 from verify | "Session expired, start again" — no jargon | Restart verification |
| 12 | Backend verify unreachable | 5xx / timeout | Neutral system error; **no red**, no user blame | Retry, then support hint |
| 13 | High Sybil signal (Selfie) | Score above threshold | Tier granted; report shown with `⚠ elevated duplicate-account signal` flag to T3 only | T3 adjudicates |

Rule for #12 and #11: **our failures are neutral-toned, the user's are instructive, policy
outcomes are factual.** Never spend the threat colour on our own outage.

---

## 8. Visual spec

### 8.1 Colour tokens

Deviations from `instructions/design.md` are marked and justified — see Decisions 2 and 4.

```css
/* ── Surface ─────────────────────────────────────── */
--bg-base:      #0a0a0f;   /* canvas                      (design.md) */
--bg-panel:     #111116;   /* rails, headers              (design.md) */
--bg-card:      #16161c;   /* cards, log rows             (design.md) */
--bg-inset:     #1c1c24;   /* inputs, map well, code   ADDED — inputs must
                              read as recessed against cards */

/* ── Structure — the primary visual device ───────── */
--line:         #26262f;   /* 1px hairline            ADDED */
--line-strong:  #34343f;   /* section dividers        ADDED */

/* ── Text ────────────────────────────────────────── */
--text-primary:   #F2F2F5; /* CHANGED from #ffffff — see Decision 4. 17.4:1 */
--text-secondary: #A0A0A8; /* (design.md)  7.1:1 on --bg-base */
--text-muted:     #6B6B75; /* (design.md)  3.4:1 — NON-TEXT ONLY.
                              Never body copy. Disabled labels use
                              #8A8A94 (4.7:1) instead. */
--text-disabled:  #8A8A94; /* ADDED — accessible disabled text */

/* ── Semantic. One colour, one meaning. No exceptions. ── */
--sig-threat:   #FF3366;   /* active threat · denial · irreversible destructive */
--sig-caution:  #FFB800;   /* awaiting human decision · expiring · degraded */
--sig-verified: #00FF94;   /* credential held · proof verified · tasking accepted */
--sig-info:     #60A5FA;   /* machine-generated · informational · archived */

/* Tinted fills — 12% over --bg-card, for left rules and badge grounds */
--tint-threat:   rgba(255, 51, 102, 0.12);
--tint-caution:  rgba(255, 184, 0, 0.12);
--tint-verified: rgba(0, 255, 148, 0.12);
--tint-info:     rgba(96, 165, 250, 0.12);

/* ── Interactive — ACHROMATIC. See Decision 2. ───── */
--action-fill:      #E8E8ED;  /* primary button bg; text --bg-base */
--action-fill-hover:#FFFFFF;
--action-line:      #3A3A46;  /* secondary button border */
--focus-ring:       #F2F2F5;  /* 2px, 2px offset — never a semantic colour */
```

Semantic colours appear only as: 2px left rules, 1px badge borders over a tint, 8px status dots,
and single-glyph icons. **Never as a large fill and never as body text.** `#00FF94` as a 400px
panel is the neon glow design.md forbids; `#00FF94` as an 8px dot beside the word `VERIFIED` is an
instrument indicator. The discipline is in the area, not the hue.

**Light mode: not supported in v1.** A C2 tool is a dark-room tool, and a half-tested light theme
is worse than none. Ship `color-scheme: dark` and revisit post-hackathon. Recorded as debt.

### 8.2 Typography

```css
--font-ui:   'Satoshi', system-ui, sans-serif;
--font-data: 'JetBrains Mono', ui-monospace, monospace;

/* Clash Display intentionally NOT loaded — see Decision 3 */

--t-display: 28px/32px  700  -0.02em   /* page title, one per route */
--t-h1:      20px/26px  700  -0.01em
--t-h2:      15px/20px  600   0.00em
--t-body:    14px/21px  400
--t-small:   13px/18px  400
--t-label:   11px/14px  600   0.08em  UPPERCASE  /* field labels, tier names */
--t-data:    14px/20px  500  --font-data  tabular-nums
--t-data-sm: 12px/16px  500  --font-data  tabular-nums  /* hashes, addresses */
```

Base body is 14px, not 16px — correct for a dense workstation tool at normal viewing distance,
and it stays above the 4.5:1 contrast floor. It **must** respond to browser zoom and root font
scaling: use `rem` throughout, never `px` on type. Mobile bumps body to 15px.

**Mono rule (Decision 3), enforced**: coordinates, speed, ETA, timestamps, durations, wallet
addresses, content hashes, nullifiers, human identifiers, tier codes (`T3`), unit callsigns.

### 8.3 Spacing — 8px grid, from design.md

`4 · 8 · 16 · 24 · 32 · 48 · 64`. Two additions for dense UI: **2px** (badge inner padding) and
**12px** (log row vertical padding — 8 is cramped for 14px text, 16 wastes a third of the rail).
Both documented deviations; nothing else off-grid.

### 8.4 Layout — desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▌MILFI    Lisbon Sector          [◆ agent chip]  [T3 COMMAND ✓]  [menu]  │ 56px
├────────────┬──────────────────────────────────────┬──────────────────────┤
│            │                                      │                      │
│ CLEARANCE  │                                      │  ACTIVITY            │
│  ladder    │            LISBON MAP                │   log, newest top    │
│            │        units · threat pins           │   agent chips inline │
│ UNITS      │                                      │                      │
│  roster    │                                      │                      │
│  + chips   ├──────────────────────────────────────┤                      │
│            │  CONTEXT PANE                        │                      │
│            │  report form / tasking decision       │                      │
│  280px     │  fluid                               │  360px               │
└────────────┴──────────────────────────────────────┴──────────────────────┘
```

Panes separated by **1px `--line` hairlines**, not gaps, not shadows, not cards-in-cards. Hairline
separation is the single most instrument-grade layout decision available and it directly avoids
design.md's cardocalypse anti-pattern.

---

## 9. The tasking authorization screen (demo step 7)

The highest-stakes screen in the product. A human must exercise meaningful control over the use of
force. Everything below follows from that.

### 9.1 Governing rules

1. **A route, never a modal.** `/tasking/:id/confirm`. A decision of this weight cannot be
   dismissable with Escape, cannot be triggered by a stray click, and must be linkable and
   reloadable without losing state.
2. **Never a toast, never a notification action.** No decision is ever reachable from a transient
   surface.
3. **No countdown, no urgency UI.** Explicitly forbidden. Manufactured time pressure on a
   use-of-force decision is a design failure with real-world consequences. The tasking may show
   how long it has been pending, factually (`Pending 00:04:12`), but nothing counts *down* and
   nothing expires the operator's judgment.
4. **Recommendation ≠ order.** The agent's output is labelled `RECOMMENDATION — ADVISORY` and is
   visually subordinate to the evidence.
5. **Claimed and verified are visually distinct.** Every field is tagged `reported` or
   `agent-verified`. An operator must never mistake an unverified claim for a checked fact.
6. **Decline is equally weighted.** Same size, same prominence, one click. A confirm-only screen
   is a rubber stamp.

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▌ TASKING AUTHORIZATION REQUIRED              Pending 00:04:12           │  ← 2px top rule
│   TSK-0031 · Lisbon Sector                    T3 COMMAND · you           │    --sig-caution
├───────────────────────────────────┬──────────────────────────────────────┤
│ EVIDENCE                          │ RECOMMENDATION — ADVISORY            │
│ ┌───────────────────────────────┐ │                                      │
│ │                               │ │ ◆ EthGlobal Analysis Agent           │
│ │      PROOF PHOTO              │ │   HUMAN-BACKED · hid:0x4a7e…21e7     │
│ │                               │ │   T3 COMMAND · Passport · Orb        │
│ └───────────────────────────────┘ │   ── expanded, never collapsed ──    │
│ Captured  2026-07-25 18:02:44 UTC │                                      │
│ Stored    0G · bafy…k3q2   [copy] │ ENGAGE: EthLisbon                    │
│ Hash      0x8c1d…4fe2      [copy] │                                      │
│                                   │ Reasoning                            │
│ Threat    Chemical    ✓ verified  │ Nearest qualified unit. 1.2 km from  │
│ Location  Parc Eduardo VII        │ threat. OPERATOR clearance held.     │
│           38.7325, -9.1536        │ Passport attested. Agent registered. │
│                       ✓ verified  │                                      │
│ Speed     0 km/h      ✓ verified  │ This is a recommendation. It has not │
│ ETA       5 s         ○ reported  │ been executed and will not execute   │
│                                   │ without your authorization.          │
│ REPORTING UNIT                    │                                      │
│ Lisbon Airport · T1 OBSERVER      │ ASSIGNED UNIT                        │
│ Selfie Check · valid 87d          │ EthLisbon · T2 OPERATOR              │
│ ◆ agent HUMAN-BACKED hid:0x91c…  │ Passport attested                    │
│                                   │ ◆ agent HUMAN-BACKED hid:0x2f8b…    │
├───────────────────────────────────┴──────────────────────────────────────┤
│ ACKNOWLEDGEMENT                                            0 of 3        │
│  ☐ I have reviewed the proof photo and the reported data.               │
│  ☐ I understand the assignment above was generated by an automated      │
│    agent and is advisory only.                                          │
│  ☐ I authorize this tasking under my COMMAND clearance. This decision   │
│    is attributed to my World ID.                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  🔒 HOLD TO AUTHORIZE          │   DECLINE TASKING                       │
│     Complete acknowledgements  │   (single click, reason required)       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.3 The acknowledgement gate

Three checkboxes, each restating a distinct accountability fact — reviewed / advisory / attributed.
All three must be ticked before the authorize control leaves its locked state. Counter reads
`0 of 3`, `1 of 3`… live, `aria-live="polite"`.

They are not a legal formality. They force the operator to read three sentences that name exactly
what they are about to do and who it will be attributed to. Do not collapse them into one
checkbox — one checkbox is a click; three sentences are a pause.

### 9.4 Hold-to-authorize

- **1200ms press-and-hold.** Progress renders as a 3px rule filling left→right inside the control,
  plus a live percentage in mono for anyone who cannot perceive the fill.
- **Release early = full reset**, no partial state, no action taken. Announced: `Authorization
  cancelled.`
- Label sequence: `HOLD TO AUTHORIZE` → `HOLD… 42%` → release-early → `HOLD TO AUTHORIZE`.
- **Keyboard equivalent**: focus the control, hold `Enter` or `Space` for 1200ms. Key-repeat must
  be suppressed (`e.repeat` guard) or the OS auto-repeat fires it instantly — a real bug in most
  implementations of this pattern.
- **Mandatory motor-accessibility alternative.** Press-and-hold excludes users with tremor, limited
  dexterity, or switch access. Directly beneath the control, always visible, never hidden behind a
  settings toggle:

  ```
  Unable to press and hold?  ▸ Authorize by typing
  ```

  Expands to: `Type the assigned unit's callsign to authorize:` with an input requiring
  `ETHLISBON` (case-insensitive, exact match). This carries the same deliberateness — arguably
  more — with zero motor demand. **This alternative is not optional and QA must verify it.**

- **`prefers-reduced-motion` does NOT shorten the hold.** The 1200ms is a safety interval, not an
  animation. Under reduced motion, replace the smooth fill with a stepped indicator updating at
  400ms intervals (`1/3 · 2/3 · 3/3`). Never remove the delay.

### 9.5 Decline

Equal visual weight, outlined, single click. Opens an inline reason select — `Insufficient
evidence · Wrong unit assigned · Threat not credible · Outside rules of engagement · Other`.
Declining is recorded and attributed exactly as authorizing is. A decline you cannot audit is not
a decision.

### 9.6 Post-decision receipt

The control area is replaced in place — no navigation, no toast — by an immutable receipt:

```
✓ TASKING AUTHORIZED
  TSK-0031 → EthLisbon
  Authorized by     ethglobal.command
  Clearance         T3 COMMAND · Passport · Orb
  World ID          0x7e21…9a04                    [copy]
  Acknowledged      3 of 3
  Timestamp         2026-07-25 18:06:31 UTC
  Receipt           0x4b8e…22f1   → persisted to 0G   [copy]
```

The attribution line is the point of the whole screen: a specific verified human, at a specific
clearance, at a specific instant, authorized this. That record is what "meaningful human control"
means in practice, and it is what the 0G layer must persist immutably (Section 12).

---

## 10. Responsive behaviour

Desktop-first. Mobile is a genuine secondary surface, not a courtesy — a unit operator in the
field submits reports from a phone. It is fully functional, not degraded.

| Breakpoint | Layout |
|---|---|
| **≥1280px** (primary) | Three panes: clearance 280px · map+context fluid · activity 360px. All visible. |
| **1024–1279px** | Two panes: clearance 280px · map+context fluid. Activity becomes a right drawer, toggled from the header, with an unread count. |
| **768–1023px** | Single column. Map collapses to a 240px band, tap to expand full-screen. Clearance moves into a header disclosure. Activity is a bottom sheet. |
| **<768px** | Single column, bottom tab bar: `Map · Report · Clearance · Activity`. Primary action in a sticky bottom bar (thumb reach — the one Mini App rule that transfers). QR flow replaced by deep link. Tasking decision becomes a full-screen route; acknowledgements stack; authorize control full-width, 56px, above the safe-area inset. |

Cross-cutting:
- Camera capture is full-bleed on mobile, well-contained on desktop.
- The evidence/recommendation split stacks on `<1024px` with **evidence first** — always read the
  facts before the machine's opinion.
- `env(safe-area-inset-bottom)` on the sticky action bar for iOS.
- Map is decorative-plus: a text unit roster with coordinates is always available and is the
  accessible equivalent. Never map-only.

---

## 11. Interactions, accessibility, animation

### 11.1 Interaction table

| Element | Hover | Focus | Active | Disabled |
|---|---|---|---|---|
| Primary button | fill → `--action-fill-hover` | 2px `--focus-ring`, 2px offset | `translateY(1px)`, no colour change | `--bg-inset` fill, `--text-disabled`, `cursor: not-allowed` |
| Secondary button | border → `--line-strong` | same ring | `translateY(1px)` | border `--line`, `--text-disabled` |
| Hold-to-authorize | border → `--line-strong` | same ring | fill rule advances | locked: lock glyph + `Complete acknowledgements`; `aria-disabled` |
| Decline | border → `--sig-threat` at 40% | same ring | `translateY(1px)` | n/a — never disabled |
| Locked action | cursor `not-allowed`, tooltip suppressed | ring on the **inner** verify link | n/a | is the resting state; `aria-disabled="true"`, stays focusable |
| Ladder tier row | `--bg-card` → `--bg-inset` | ring inset 2px | n/a | n/a |
| Log row | left rule brightens | ring inset | n/a | n/a |
| Agent chip | `▸` rotates 90° | ring | expands | n/a |
| Text input | border → `--line-strong` | ring + border `--text-secondary` | — | `--bg-panel`, `--text-disabled` |
| Checkbox (ack) | border → `--text-secondary` | ring | — | n/a |
| Capture button | ring grows 2px | ring | scale 0.96 | greyed while camera initialising |
| Copy button | icon → `--text-primary` | ring | icon swaps to check 1.5s | n/a |

### 11.2 Accessibility checklist

- [ ] Contrast ≥ 4.5:1 for all text. Verified: `--text-primary` 17.4:1, `--text-secondary` 7.1:1,
      `--text-disabled` 4.7:1. `--text-muted` (3.4:1) is **non-text only** — hairlines, inactive
      icons. Never body copy.
- [ ] **Nothing conveyed by colour alone.** Every semantic colour is paired with a text label and
      a distinct glyph: threat `◼` / caution `!` / verified `✓` / info `◆`. Non-negotiable in a
      red-green C2 interface — deuteranopia affects roughly 1 in 12 men, a population heavily
      represented among this product's users.
- [ ] Focus ring visible on every interactive element, achromatic, 2px + 2px offset, never
      removed on mouse input.
- [ ] Logical tab order. On the tasking screen: evidence → recommendation → ack 1,2,3 → authorize
      → typed alternative → decline.
- [ ] Locked actions use `aria-disabled`, **not** `disabled`, so screen-reader users can discover
      why they are blocked.
- [ ] `aria-live="polite"` on the QR status stepper and the ack counter.
- [ ] `aria-live="assertive"` on: scan-received, denial outcome, authorization complete, camera
      permission denied. These four and no others — over-using assertive makes it noise.
- [ ] Camera viewfinder has `aria-label="Live camera viewfinder"`; the capture button announces
      `Capture proof photo`; success announces `Photo captured at HH:MM:SS`.
- [ ] Hold-to-authorize has a full non-motor alternative (§9.4). QA must test it explicitly.
- [ ] Keyboard hold suppresses OS key-repeat.
- [ ] Touch targets ≥ 44×44px on mobile; ≥ 32×32px with 8px separation on desktop.
- [ ] Error copy states the fix, not just the failure — "Allow camera access in your browser's
      address bar", not "Camera error".
- [ ] Map has a text-equivalent unit roster with coordinates.
- [ ] All type in `rem`; layout survives 200% browser zoom without loss of function.
- [ ] `prefers-reduced-motion` honoured for all decorative motion; **safety delays preserved**.
- [ ] No content depends on hover — every hover disclosure is also reachable by focus or tap.

### 11.3 Animation spec

| Animation | Trigger | Duration | Easing | Reduced motion |
|---|---|---|---|---|
| Pane / route transition | Navigation | 180ms | `ease-out` | Opacity only |
| QR status change | Stepper transition | 160ms | `ease-out` | Instant swap |
| QR waiting pulse | Idle | 2000ms loop, opacity 0.4→1 | `ease-in-out` | Static dot |
| Verifying bar | In flight | 1200ms loop | `linear` | Static bar + text |
| Ack checkbox | Tick | 120ms | `ease-out` | Instant |
| **Hold-to-authorize fill** | Press/hold | **1200ms — SAFETY, never shortened** | `linear` | Stepped 3× at 400ms |
| Receipt reveal | Decision complete | 220ms | `ease-out` | Instant |
| Log row insert | New entry | 200ms, slide 8px + fade | `ease-out` | Fade only |
| Copy confirm | Copy click | 1500ms hold, 150ms out | `ease-out` | Instant swap |
| Expiry band | Threshold crossed | 240ms height | `ease-out` | Instant |
| Denial card | Render | **none** | — | — |

Denial gets no entrance animation at all. Motion on that screen reads as punishment.

---

## 12. Seams and persistence handoff

### 12.1 Layer boundaries

| Seam | We supply | Partner supplies | We render |
|---|---|---|---|
| **0G — proof photos** | Captured image blob + capture timestamp + reporter nullifier | Storage URI + content hash + confirmation | `stored · 0G · bafy…k3q2` + hash + copy button. **Never** storage internals, never a progress bar over their pipeline |
| **0G — verifiable inference** | Report fields + photo reference | Verification result per field + agent attribution | `✓ verified` / `○ reported` per field + agent chip |
| **0G — state** | The manifest in §12.2 | Persistence + retrieval | Nothing directly |
| **Hedera — payments** | Recipient's nullifier, tier, tasking ID, authorization receipt | Payment status, amount, tx reference | A single activity-log row: `Reward released · 25 USDC · tx 0x…`. **No payment form, no balance, no wallet UI in our layer.** |

If a partner layer is unavailable, our UI degrades to a caution band naming the layer
(`Proof storage unavailable`) and preserves user input. It never fabricates a success state, and
it never shows an error implying the user did something wrong.

### 12.2 Persistence manifest — required from 0G (we have no database)

| Key | Value | Why |
|---|---|---|
| `session.nullifier` | Per-action nullifier hash | Identity continuity across reloads |
| `session.tier` | `T0`–`T3` | Access control on every request |
| `session.credentials[]` | `{ type, verified_at, expires_at }` | Ladder rendering + 90-day countdown |
| `credential.selfie.expires_at` | Timestamp | Expiry band and capability lock |
| `attestation.identity` | `{ attested: bool, at, policy_version }` | Re-verify on policy change. **Boolean only.** |
| `attestation.attempts` | `{ nullifier, last_attempt_at }` | 24h anti-oracle rate limit (§5.3) |
| `agent.registration` | `{ agent_wallet, human_identifier, chain, registered_at, backer_tier }` | Attribution chip on every artefact |
| `report.*` | Fields + 0G photo URI + hash + reporter nullifier + captured_at | Evidence pane |
| `tasking.authorization` | `{ tasking_id, decision, authorizer_nullifier, authorizer_tier, acks[], reason?, timestamp, receipt_hash }` | **Immutable.** The accountability record. Append-only, never mutable. |

### 12.3 MUST NOT be stored, transmitted, or logged — anywhere

```
✗ Nationality or issuing country          ✗ Any document image
✗ Full name                               ✗ Selfie image or frame
✗ Document number or type                 ✗ Face template or embedding
✗ Date of birth                           ✗ Any World App-internal identifier
```

We never receive most of these — that is the architecture, and it is what the copy in §3.2 and
§5.2 promises. This list exists so a future implementer does not quietly add a "helpful" field and
turn our honest copy into a lie. Recommend a CI check: fail the build on these field names in any
persisted schema.

---

## 13. Developer notes

1. **Do not install `@worldcoin/mini-apps-ui-kit-react`** (Decision 1). Install `@worldcoin/idkit`.
   If it lands in `package.json`, the tree-shaking is not the problem — its `globals.css` and font
   stack will fight the app's, exactly as design.md warns at lines 118–122.
2. **No MiniKit.** No `walletAuth`, no `pay`, no `sendTransaction`, no `Haptic`. This is a browser.
   Anything in the codebase reaching for `window.MiniKit` is a bug.
3. **Verify proofs server-side only.** `handleVerify` posts to `/api/verify-proof`; the client
   never decides a tier. Client tier state is presentational and must be re-derived server-side on
   every privileged call.
4. **Never branch on tier at a call site.** Use `can(capability)` returning
   `{ allowed, missing[] }` (§2). The locked-state UI renders from `missing`, which is what keeps
   copy and policy from drifting.
5. **`aria-disabled`, not `disabled`, on locked actions.** Recurring accessibility regression —
   worth a lint rule.
6. **Key-repeat guard on hold-to-authorize.** Without `if (e.repeat) return`, OS auto-repeat fires
   the hold instantly. This is the classic bug in this pattern; test on Windows and macOS.
7. **Camera capture cannot be enforced client-side.** `<input capture="environment">` is a hint,
   not a guarantee, and `getUserMedia` can be fed a virtual camera. We spec no file-picker path and
   we record `captured_at`, and that is the honest limit of what the client can assert. **Do not
   let the UI claim the photo is provably live.** Flag to CTO as accepted demo-scope debt.
8. **The 1200ms hold is product logic, not styling.** Do not let a "performance" or reduced-motion
   change shorten it. Consider a code comment saying so.
9. **QR expiry comes from `rp_context.expires_at`.** Do not hardcode a duration. Handle clock skew:
   if the server rejects an unexpired-looking signature, show failure mode #11, not a raw error.
10. **Poll cleanup.** Stop IDKit polling on unmount, on tab hidden for >10 min, and on the abandon
    timer. A forgotten poller on a verification route is a battery and rate-limit problem.
11. **Tabular numerals** — `font-variant-numeric: tabular-nums` on every mono value, or the
    countdown and speed readouts jitter.
12. **Demo toggles** the team will need on stage: force `identity_attested: false`, force an
    unbacked agent, force credential expiry, force camera denial. Build them behind
    `?demo=` — the denial and unbacked-agent states are the most persuasive things we can show a
    judge, and they must be reachable on demand.
13. **`color-scheme: dark`** declared globally. No light theme in v1 (§8.1).

---

## 14. Open questions for the CTO

1. **Does IDKit expose a scan-received event before proof completion?** The `waiting → scanned`
   transition (§3.3) is the primary anti-drop-off mechanism. If not available, we need an agreed
   fallback signal.
2. **Where does the 24h anti-oracle rate limit live** (§5.3) with no database on our side — 0G, or
   an in-memory limiter accepting reset-on-deploy for the demo?
3. **Is `identityCheck` + `proofOfHuman` a single combined request or two sequential ones for T3?**
   Determines whether the T3 path is one QR scan or two. Two scans roughly doubles drop-off; if
   two are required, the ladder must show `Step 1 of 2` explicitly.
4. **Nationality allow-list configuration** — Developer Portal action config, or app-side policy?
   Affects `policy_version` in the attestation record and whether policy changes force re-attestation.
5. **AgentKit registration is CLI-first** (`npx @worldcoin/agentkit-cli register`). §3.5 assumes a
   programmatic path from a web session. If registration cannot be driven from the browser, the
   onboarding step must change — this is a **blocking design dependency**.

---

## 15. Self-check against persona and design.md

| Check | Result |
|---|---|
| Looks like every other AI landing page? | No. Hairline-separated instrument panes, achromatic actions, mono data. |
| Could exist in 2019? | Yes — no glassmorphism, no gradient meshes, no neon glow, no oversized icons. |
| Every element informational, not vibes? | Yes. Only decorative element removed: the QR expiry ring, replaced by text. |
| Colours from design.md? | Yes, with two documented reassignments (Decisions 2, 4) and three additions (`--bg-inset`, `--line`, `--text-disabled`), each justified. |
| Cardocalypse avoided? | Yes — hairlines, not nested cards. |
| Everything-is-a-modal avoided? | Yes — pre-consent, QR, denial, and tasking are all routes. Zero modals in the spec. |
| One accent, one meaning? | Yes, and strengthened: interaction is achromatic so all four semantic colours stay unambiguous. |
| Four states per screen? | Yes — §7, plus 13 enumerated failure modes. |
| Flow unambiguous for developers? | Copy is verbatim, thresholds numeric, tokens named, boundary cases enumerated. Five genuine unknowns are escalated in §14 rather than guessed. |

---

## Next steps

- [ ] CTO review — Phase 5. Priority items: Decision 1 (drop the Mini App kit) and the five open
      questions in §14, especially Q5 (AgentKit browser registration) which is blocking.
- [ ] Resolve Q1 with the World docs MCP or the IDKit source before building the QR panel.
- [ ] Confirm the 0G persistence manifest (§12.2) with the storage owner — the tasking
      authorization record must be append-only.
- [ ] Confirm the payment seam (§12.1) with the Hedera owner — our layer renders one status row and
      no payment UI.
- [ ] Build demo toggles (§13.12) early; the denial and unbacked-agent states are the demo's
      strongest moments.

---

**Note on the exit checklist**: this project is not yet a git repository. The mandatory
`git add -A && git commit` step was **deliberately skipped** — no `git init` was run, per the
task instruction. `.claude/sprints/current.md` and `.claude/workflows/NOTIFICATION_LOG.md` were
updated.
