# Agent Exit Checklist

**MANDATORY**: Every agent MUST complete these steps before ending their session.

---

## Before You End Your Session

### Step 1: Persist Your Output

Write your findings/work to the designated output file:

```
.claude/outputs/
├── research/      # Research findings, comparisons, recommendations
├── plans/         # Implementation plans, technical designs
├── reviews/       # Code review records, QA reports
└── sessions/      # Session logs, incomplete work context
```

**Output File Format:**

```markdown
# [Title]

**Date**: YYYY-MM-DD
**Agent**: [your-agent-type]
**Status**: COMPLETE / INCOMPLETE

## Summary
[1-2 paragraph summary of what was done]

## Key Findings / Deliverables
[Main content]

## Files Modified (if any)
- `path/to/file.ts` - [what changed]

## Recommendations / Next Steps
- [ ] [Action item]

## Context for Continuation (if incomplete)
[Any context needed to continue this work]
```

### Step 2: Commit Changes (If Code Was Written)

If you modified any code files:

```bash
git add -A && git commit -m "[type]: [description]"
```

Commit types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code restructure
- `test`: Tests
- `chore`: Maintenance

### Step 3: Update Sprint Status

Update `.claude/sprints/current.md`:

If task complete:
```markdown
| [Task] | [You] | [Branch] | COMPLETE | YYYY-MM-DD HH:MM |
```

If task incomplete:
```markdown
| [Task] | [You] | [Branch] | IN_PROGRESS | YYYY-MM-DD HH:MM |
```

### Step 4: Update Notification Log

Update `.claude/workflows/NOTIFICATION_LOG.md`:

If task complete, move to appropriate section:
- **Pending CEO Review**: Deliverable ready for CEO
- **Awaiting CTO Review**: Code ready for CTO review
- **Completed Today**: Reviewed and approved work

If task incomplete, update "In Progress" with latest timestamp.

### Step 5: Handle Incomplete Work

If you cannot complete your task:

1. Create session log: `.claude/outputs/sessions/YYYY-MM-DD-[task].md`
2. Include:
   - What was done
   - What remains
   - Blockers encountered
   - Context needed to continue
3. Update NOTIFICATION_LOG.md with blocker reason

---

## Verification Checklist

Before ending, verify:

```
[ ] Output file exists in .claude/outputs/[category]/
[ ] If code changed, commit was made
[ ] current.md reflects my task status
[ ] NOTIFICATION_LOG.md reflects my task status
[ ] If incomplete, session log exists with context
```

---

## Common Mistakes to Avoid

1. **DON'T** end without writing output file
2. **DON'T** leave code uncommitted
3. **DON'T** forget to update tracking files
4. **DON'T** leave work in "In Progress" if complete
5. **DON'T** skip session log if incomplete

---

## Template: Session Log (for incomplete work)

```markdown
# Session Log: [Task Name]

**Date**: YYYY-MM-DD HH:MM
**Agent**: [agent-type]
**Status**: INCOMPLETE

## What Was Done
- [Action 1]
- [Action 2]

## What Remains
- [ ] [Remaining task 1]
- [ ] [Remaining task 2]

## Blockers
- [Blocker description and reason]

## Files in Progress
- `path/to/file.ts` - [current state]

## Context for Next Agent
[Everything the next agent needs to know to continue]

## Estimated Remaining Effort
[X] hours
```
