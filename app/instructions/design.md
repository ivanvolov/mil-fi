# Design System — World Mini App

> Adapted from the Regata project's `instructions/design.md`. The **structural rules** carried
> over (philosophy, screen states, component mapping, accessibility, animation restraint).
> Regata's dark/orange-red palette did **not** carry over — this project uses World's own UI kit.
>
> The `ui-ux-specialist` agent reads this file during the Design phase.

---

## Philosophy

1. **The platform sets the visual language, not you.** A Mini App that looks alien inside World
   App reads as untrustworthy. Use `@worldcoin/mini-apps-ui-kit-react` before writing custom UI.
2. **Mobile-only.** There is no desktop breakpoint. Design for one narrow column, thumb reach,
   and interruption.
3. **Every screen has four states.** Empty, loading, success, error. Specify all four before coding.
4. **Restraint over decoration.** Animation communicates state change; it isn't ornament.

---

## The Golden Rule: Check the Kit First

Before writing any custom component, check whether the UI kit already has it.
**45 components are available** in `@worldcoin/mini-apps-ui-kit-react`:

### Input & Forms
`Input` · `TextArea` · `SearchField` · `PasswordField` · `PhoneField` · `OTPField` ·
`WalletAddressField` · `Select` · `Checkbox` · `RadioGroup` · `Switch` · `ToggleGroup` ·
`NumberPad` · `ColorPicker` · `Form` · `ClearButton` · `PasteButton`

### Layout & Navigation
`TopBar` · `BottomBar` · `SafeAreaView` · `Tabs` · `Drawer` · `DrawerDialog` · `Dialog` ·
`AlertDialog` · `CountryDrawer` · `ListItem`

### Display & Feedback
`Typography` · `Button` · `Chip` · `Pill` · `Token` · `Flag` · `Marble` · `BulletList` ·
`CircularIcon` · `CircularState` · `VerificationBadge` · `Progress` · `Spinner` · `Skeleton` ·
`LiveFeedback` · `Toast` · `Haptic` · `Icons`

> If you find yourself hand-rolling a spinner, a bottom sheet, or a wallet address field —
> stop. It exists. Custom versions drift from World App's look and fail on device edge cases.

Icons: `iconoir-react` is already a dependency. Use it rather than adding an icon library.

---

## Screen States — Required for Every Feature

The UI/UX spec must define all four before any code is written:

| State | Question to answer | Kit component |
|-------|--------------------|---------------|
| **Empty** | What does a first-time user with no data see? | `Typography`, `BulletList` |
| **Loading** | What shows while waiting? | `Skeleton` (layout known), `Spinner` (unknown) |
| **Success** | What confirms it worked, and what's the next action? | `Toast`, `CircularState`, `Haptic` |
| **Error** | What went wrong, and how does the user recover? | `AlertDialog`, `LiveFeedback` |

**Never ship a screen with only the success state designed.**

---

## World-Specific UX Rules

### Verification is a trust signal — show it
Use `VerificationBadge` when displaying a World ID-verified user. That badge is the whole
reason a user picked a Mini App over a website; hiding it wastes the platform's advantage.

### MiniKit commands take time and can be rejected
`walletAuth`, `verify`, `pay`, and `sendTransaction` hand control to World App's native UI.
Every one of them needs:
- a **pending** state while the native sheet is open,
- a **rejected** path (user cancelled — this is normal, not an error to scold them for),
- a **failed** path (network, insufficient funds, expired proof).

Use `LiveFeedback` for in-flight command state.

### Thumb reach
Primary actions belong at the bottom (`BottomBar`), not the top. The top of a phone screen is
the hardest place to reach one-handed.

### Safe areas
Wrap screens in `SafeAreaView`. Notches and home indicators will clip your layout otherwise.

### Haptics
Use the `Haptic` component for meaningful confirmations (payment sent, proof verified).
Not for every tap.

---

## Layout Patterns

The template provides `src/components/PageLayout/` — use it rather than re-deriving page chrome.

```
┌─────────────────────┐
│ TopBar              │  title, optional back
├─────────────────────┤
│                     │
│  content            │  single column, scrollable
│                     │
├─────────────────────┤
│ BottomBar           │  primary action / nav
└─────────────────────┘
```

Rules:
- **One primary action per screen.** If there are two, one of them is secondary.
- **One column.** No side-by-side layouts.
- **Vertical rhythm from the kit's spacing scale** — don't invent arbitrary pixel gaps.

---

## Typography

Use the `Typography` component rather than raw `<h1>`/`<p>` with Tailwind classes. It carries
the kit's scale and keeps sizing consistent across screens.

The template's `globals.css` currently sets `font-family: Arial, Helvetica, sans-serif` on
`body` and defines light/dark `--background` / `--foreground` variables. If you adopt the kit's
own `globals.css`, reconcile the two — don't let both fight over the same properties.

---

## Color

**Do not invent a brand palette before the PRD exists.** Inherit the kit's tokens.

The template already supports light and dark via `prefers-color-scheme`. Anything you add must
work in **both** — test both before calling a screen done. A hardcoded hex that looks right in
light mode and disappears in dark mode is a bug, not a style choice.

When a brand color is eventually chosen, document it here as a single accent token and use it
in exactly one role. Regata's hard-won rule, worth keeping:

> **One accent color, one meaning.** Don't use the same color for "urgent" and "confirmed".

---

## Animation

- **Purpose only** — animate to show state change or spatial relationship
- **Fast** — 150–250ms for most transitions
- **Respect `prefers-reduced-motion`**
- **No bouncy easing on functional UI** — save personality for celebration moments

---

## Accessibility Checklist

Every feature must pass before QA signs off:

- [ ] Tap targets ≥ 44×44px
- [ ] Contrast ratio ≥ 4.5:1 for body text, in **both** light and dark
- [ ] All interactive elements reachable and labeled (`aria-label` on icon-only buttons)
- [ ] Focus states visible
- [ ] Error messages describe the fix, not just the failure
- [ ] Nothing conveyed by color alone
- [ ] `prefers-reduced-motion` honored

---

## Implementation Notes

- **Read client logs on device with Eruda** — `src/providers/Eruda/` is already wired up.
  You cannot open devtools inside World App.
- **Test on a real phone.** Desktop browser rendering does not prove a Mini App works —
  it misses safe areas, native sheets, and the MiniKit bridge entirely.
- **Tailwind v4** is in use (`@import 'tailwindcss'`), not v3. Config syntax differs.
- `clsx` and `tailwind-merge` are available for conditional classes.

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) — Design phase sits at Phase 4, before any coding
- [CONTRIBUTING.md](../CONTRIBUTING.md) — code standards
- World UI kit — https://docs.world.org/mini-apps
