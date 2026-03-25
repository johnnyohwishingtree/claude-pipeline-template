---
name: audit
description: Audit codebase for drift, dead code, and architecture violations — adds gaps to knowledge graph
argument-hint: "[--dry-run]"
---

# /audit — Codebase Health Audit

Checks the codebase for drift, dead code, stale references, and violations. Adds findings as gap entries to the relevant `.knowledge/` knowledge files and creates fix stories.

**Scheduled task prompt:**
```
Read CLAUDE.md for project context.
Read .claude/skills/audit/SKILL.md and follow every step.
```

## Step 1: Run checks

Run each check below. For every issue found, note the category and finding.

### Dead code
- Exports that nothing imports
- Modules with no test file

### Architecture violations
- Wrong dependency direction
- Modules over 500 lines

### Stale references
- `.claude/` paths where `.knowledge/` is intended
- Files referenced in docs that don't exist

### Drift
- README commands that don't match CLI help
- Config references to files that don't exist

## Step 2: Add findings to knowledge graph

For each finding, add a gap entry to the relevant `.knowledge/` file:

| Finding type | Add gap to |
|---|---|
| Dead code, untested modules | `.knowledge/templates/story.md` or `.knowledge/conventions/testing.md` |
| Architecture violations | `.knowledge/concepts/dependency-direction.md` (create if missing) |
| Stale references, drift | `.knowledge/concepts/drift-detection.md` |
| Missing conventions | `.knowledge/conventions/` (create new file) |

```markdown
## Known gaps
- audit: <finding summary> (audit-YYYY-MM-DD)
```

## Step 3: Create fix stories (if not --dry-run)

Group findings by category. For each group, create a story following `.knowledge/templates/story.md`.

```bash
REPO="OWNER/REPO"  # CUSTOMIZE
DATE=$(date +%Y-%m-%d)

gh issue create --repo $REPO \
  --title "Story: Fix <category> issues from $DATE audit" \
  --label "story,pending" \
  --body "<follow story template>"
```

## Step 4: Commit and push

```bash
git add .knowledge/
git diff --cached --quiet || git commit -m "chore: audit findings ($DATE)" && git push origin master
```

## What NOT to flag
- Empty knowledge directories (they fill up over time)
- Missing domain knowledge files (created when needed)
