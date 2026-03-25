---
name: audit
description: Audit codebase for drift, dead code, and architecture violations — adds gaps to knowledge graph
argument-hint: "[--dry-run]"
---

# /audit — Codebase Health Audit

Checks that code follows folder-level CLAUDE.md conventions, detects drift, dead code, and architecture violations. Writes all findings to `.knowledge/gaps.md` and creates fix stories.

**Scheduled task prompt:**
```
Read CLAUDE.md for project context.
Read .claude/skills/audit/SKILL.md and follow every step.
```

## Step 1: Convention compliance

For each folder CLAUDE.md file, read it and all its `See:` linked `.knowledge/` files. Then check whether the code in that folder actually follows the stated rules.

For example, if a folder CLAUDE.md says "never import X directly," grep the folder's source files for those imports. If it says "all exports go through the public API," compare directory contents to what's exported.

Add more checks as new folder CLAUDE.md files are created — read the rules, then verify them.

### General checks (all folders with CLAUDE.md)
- Verify every `See:` link points to an existing `.knowledge/` file
- Verify folder CLAUDE.md is 5 lines or fewer (content belongs in `.knowledge/`)

## Step 2: Structural checks

### Dead code
- Exports that nothing imports
- Modules with no corresponding test file

### Architecture violations
- Wrong dependency direction (check `.knowledge/concepts/` for project rules)
- Source files over 500 lines

### Drift
- `.knowledge/` or `.claude/` path references pointing to files that don't exist
- README commands that don't match actual CLI behavior
- Config references to files that don't exist

### Index sync (`.knowledge/index.md`)
Compare the index against what actually exists on disk. Fix any mismatches directly (don't add to gaps — just update the file):
- Skills listed that don't exist (deleted but not removed from index)
- Skills that exist but aren't listed
- `.knowledge/` directories or files added but not listed in the knowledge table
- Run: `ls .claude/skills/` and `ls .knowledge/*/` and diff against index.md

## Step 3: Evaluate each finding

For every violation found, decide:

**Is the code wrong?** The convention is correct but code doesn't follow it.
- Add to `gaps.md` as a code fix

**Is the knowledge stale?** The code is intentionally doing something different and the convention needs updating.
- Add to `gaps.md` as a knowledge update

This evaluation is critical. Don't blindly flag violations — understand whether reality or documentation is wrong.

## Step 4: Write findings to gaps.md

Write all findings to `.knowledge/gaps.md`. Each entry includes: what's wrong, where, and whether to fix code or update knowledge.

```markdown
# Gaps

Findings from audits and pipeline runs. Fix stories resolve these and remove the entry.

## Code fixes
- `src/path/to/file` violates <rule> — <what should change> (audit-YYYY-MM-DD)

## Knowledge updates
- `.knowledge/conventions/foo.md` says X but codebase does Y everywhere — update convention (audit-YYYY-MM-DD)

## Drift
- Reference to `path/that/moved` in `.knowledge/foo.md` — update path (audit-YYYY-MM-DD)
```

If `gaps.md` already exists, **merge** new findings — don't duplicate entries that are already there.

## Step 5: Create fix stories (if not --dry-run)

Group findings by category. For each group with 2+ items, create a story.

```bash
REPO="OWNER/REPO"  # CUSTOMIZE
DATE=$(date +%Y-%m-%d)

gh issue create --repo $REPO \
  --title "Story: Fix <category> issues from $DATE audit" \
  --label "story,pending" \
  --body "<follow .knowledge/templates/story.md>

After completing fixes, remove resolved entries from .knowledge/gaps.md."
```

Always add the reminder to remove resolved entries from `gaps.md` in the story body.

## Step 6: Commit and push

```bash
git add .knowledge/gaps.md
git diff --cached --quiet || git commit -m "chore: audit findings ($DATE)" && git push origin master
```

## What NOT to flag
- Empty `.knowledge/` directories (they fill up over time)
- Missing domain knowledge files (created when needed)
- Violations already listed in `gaps.md` (don't duplicate)
