---
name: spec-interviewer
description: Gather requirements through structured questions before implementing features. Use when starting a new feature, planning implementation, or when the user says "interview me", "help me plan", "what should we build", or starts a vague request. This skill helps clarify requirements BEFORE writing any code. Use Opus model.
model: opus
---

# Spec Interviewer Skill

## Purpose

When you receive a vague or complex feature request, use this skill to gather requirements through structured questions BEFORE writing any code.

**When to use:**
- User starts with "I want to add..." or "Can you build..."
- Request is ambiguous or could be interpreted multiple ways
- Feature involves multiple components or user flows
- You need to understand scope before committing to an approach

## Interview Framework

Use the AskUserQuestion tool to gather requirements. Ask questions in batches of 2-4.

### Round 1: Core Goal

Ask about:
1. **What problem does this solve?** - The "why" behind the feature
2. **Who is the end user?** - Founder? Client? Visitor?
3. **What's the MVP?** - Smallest useful version

Example questions:
```
header: "Core Goal"
question: "What specific problem are you trying to solve with this feature?"
options:
  - "Increase conversions"
  - "Reduce manual work"
  - "Add new capability"
  - Other
```

### Round 2: Functional Requirements

Ask about:
1. **What data is involved?** - Input, output, storage
2. **What actions can users take?** - Buttons, forms, flows
3. **What are the success criteria?** - How do we know it works?

Example:
```
header: "User Actions"
question: "What should users be able to do?"
options:
  - "View data"
  - "Submit form"
  - "Trigger action"
  - "Configure settings"
multiSelect: true
```

### Round 3: Technical Context

Ask about:
1. **Where does this fit?** - Existing file, new component, API?
2. **What existing patterns should we follow?** - design.md, existing code
3. **Any constraints?** - Performance, compatibility, third-party APIs

### Round 4: Scope & Priority

Ask about:
1. **Timeline?** - Urgent fix vs nice-to-have
2. **Batch size?** - Can we ship in parts?
3. **Dependencies?** - What needs to be done first?

## Output Format

After gathering requirements, produce a **Spec Document**:

```markdown
## Feature: [Name]

### Problem Statement
[1-2 sentences on what problem this solves]

### User Stories
- As a [user], I want to [action] so that [benefit]
- As a [user], I want to [action] so that [benefit]

### Acceptance Criteria
- [ ] [Specific testable criterion]
- [ ] [Specific testable criterion]
- [ ] [Specific testable criterion]

### Technical Approach
- File(s) to modify: [list]
- New files needed: [list or "none"]
- Database changes: [list or "none"]

### Batch Plan
- **Batch 1 (MVP)**: [scope]
- **Batch 2 (Nice-to-have)**: [scope]

### Open Questions
- [Any unresolved items]
```

## Example Interaction

```
User: I want to add analytics

Claude: Before I build, let me understand what you need.

[Uses AskUserQuestion]
Question 1: "What metrics matter most to you?"
Options:
  - Conversion rate (visitors → calls)
  - Response time (how fast you answer)
  - Lead quality (score distribution)
  - Other

Question 2: "Where should analytics appear?"
Options:
  - Existing dashboard
  - New dedicated page
  - Slack notifications
  - All of the above

[After gathering answers]

## Feature: Analytics Dashboard

### Problem Statement
Need visibility into conversion metrics to optimize widget performance.

### User Stories
- As a founder, I want to see conversion rate so I can measure ROI
- As a founder, I want to see avg response time so I can improve

### Acceptance Criteria
- [ ] Dashboard shows total visitors, calls, conversion rate
- [ ] Shows avg time from request to call start
- [ ] Updates in real-time with existing polling

### Technical Approach
- Modify: src/app/debug/page.tsx (add stats section)
- New: None
- Database: Use existing sessions table, aggregate data

### Batch Plan
- Batch 1: Add conversion rate and counts to dashboard
- Batch 2: Add time-series charts
```

## Guidelines

1. **Ask BEFORE building** - Never start coding until requirements are clear
2. **One question at a time** - Don't overwhelm with 10 questions
3. **Propose smallest batch** - Suggest MVP, let user expand
4. **Reference existing patterns** - Check design.md, vibe.md, Plan.md
5. **Document decisions** - Spec becomes reference for implementation

## For World Mini Apps Specifically

When interviewing for Mini App features, always ask:
- Does this run **client-side in the World App webview** or in a **Next.js API route**?
- Does this need a **MiniKit command**? (`walletAuth`, `verify`, `pay`, `sendTransaction`)
  If yes, confirm the exact payload shape against https://docs.world.org — do not assume.
- Does this need **World ID proof of personhood**, or is wallet sign-in enough?
- Does this need **persistence**? (v1 has no database — flag it as a blocker, not an assumption)
- Does this change the **app store listing**? (name, description, images, permissions →
  needs `configure_mini_app` / `upload_app_image` via the Developer Portal MCP)
- Is this **one batch or multiple**? (One batch per conversation)
