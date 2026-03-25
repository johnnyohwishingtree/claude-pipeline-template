---
name: pipeline
description: Autonomous story pipeline — implement, verify, merge, learn, plan
argument-hint: "[--issue N]"
---

# /pipeline — Autonomous Story Pipeline

Implements pending stories, verifies quality, merges, updates the knowledge graph, and plans new work when the queue is empty.

**Scheduled task prompt:**
```
Read CLAUDE.md for project context.
Read .claude/skills/pipeline/SKILL.md and follow every step.
```

## Step 1: Merge open PRs

```bash
REPO="OWNER/REPO"  # CUSTOMIZE: your org/repo
gh pr list --repo $REPO --state open --json number,title,headRefName --jq '.[]'
```

For each open PR: review the diff, merge if clean, fix if not.

```bash
git checkout master && git pull origin master
```

## Step 2: Find next story

```bash
gh issue list --repo $REPO --label "story" --label "pending" --state open --json number,title --jq '.[0]'
```

If no pending stories → skip to **Step 7**.

## Step 3: Implement

```bash
NUMBER=<issue number>
gh issue edit $NUMBER --repo $REPO --remove-label "pending" --add-label "in-progress"
git fetch origin master && git checkout -b story/issue-$NUMBER origin/master
```

Read the story body. Implementation order:
1. Read the **Knowledge** section — these `.knowledge/` files give you context
2. Read the **Tasks** section — each task references a template or pattern to follow
3. Read the **Context** section — the minimum source files to read
4. Implement each task following the referenced `.knowledge/` file

## Step 4: Verify (up to 6 attempts)

Run your project's verification commands (from CLAUDE.md):
```bash
# CUSTOMIZE: your project's check commands
pnpm build && pnpm typecheck && pnpm test
```

If checks fail → fix → rerun. Up to 6 attempts.

If still failing after 6 attempts → push WIP branch, create draft PR, reset story to `pending`, stop.

## Step 5: Learn — update the knowledge graph

After verify passes, reflect on each task you implemented:

1. **Did you have to figure something out not covered by any `.knowledge/` file?**
   → Add an entry to `.knowledge/gaps.md` under the appropriate section:
   ```markdown
   ## Knowledge updates
   - `.knowledge/<file>.md` missing guidance on <topic> — found in <where> (#$NUMBER)
   ```

2. **Did you discover a concept that applies broadly but isn't documented?**
   → Create `.knowledge/concepts/<name>.md`

3. **Did you learn a project convention that isn't written down?**
   → Create or update `.knowledge/conventions/<name>.md`

4. **Did you encounter domain knowledge the pipeline should know?**
   → Create or update `.knowledge/domain/<name>.md`

5. **Did you discover a convention specific to a directory you worked in?**
   → Check if that directory has a `CLAUDE.md` already
   → If not, create one following `.knowledge/templates/folder-claude-md.md` — max 5 lines, just pointers to `.knowledge/` files
   → If yes but it's missing a relevant link, add the "See:" line

If nothing was missing — do nothing. No gaps = knowledge graph is working well.

Include modified `.knowledge/` files and any new folder `CLAUDE.md` files in your commit.

## Step 6: Self-review against rubrics

Before committing, review your own diff against the relevant rubrics. This catches quality issues that verification (lint/typecheck/test) misses.

```bash
git diff --cached --stat  # or git diff if not yet staged
```

Read the diff and check against:
- `.knowledge/rubrics/code-quality.md` — for any source files changed
- `.knowledge/rubrics/test-quality.md` — for any test files changed
- `.knowledge/rubrics/skill-quality.md` — for any skill files changed

For each criterion in the rubric, scan the diff:

**Fix immediately** (don't commit until fixed):
- `any` types — find the real type
- Unused imports or variables — delete them
- Empty catch blocks — add error handling
- Missing tests for new functions — write them
- Functions over 50 lines — split them
- Anti-patterns listed in the relevant `.knowledge/` convention files

**Add to gaps.md** (can't fix without human input):
- Architectural questions about where code belongs
- Unclear requirements that led to guesswork
- Convention gaps discovered during review

After fixing, re-run verification to confirm fixes don't break anything.

## Step 7: Push, PR, merge

```bash
git add <specific files>
git commit -m "<descriptive message>

Closes #$NUMBER"
git push -u origin story/issue-$NUMBER

TITLE=$(gh issue view $NUMBER --repo $REPO --json title --jq .title)
gh pr create --repo $REPO --head story/issue-$NUMBER --base master --title "$TITLE" \
  --body "Closes #$NUMBER — implemented by pipeline."
PR_NUM=$(gh pr list --repo $REPO --head story/issue-$NUMBER --json number --jq '.[0].number')
gh pr merge $PR_NUM --repo $REPO --squash
```

Close story and auto-close epic if all stories done:
```bash
gh issue edit $NUMBER --repo $REPO --remove-label "in-progress" --add-label "completed"
gh issue close $NUMBER --repo $REPO

EPIC_LABEL=$(gh issue view $NUMBER --repo $REPO --json labels --jq '[.labels[].name | select(startswith("epic:"))] | .[0]')
if [ -n "$EPIC_LABEL" ] && [ "$EPIC_LABEL" != "null" ]; then
  OPEN=$(gh issue list --repo $REPO --state open --json labels --jq "[.[] | select(.labels | map(.name) | any(. == \"$EPIC_LABEL\"))] | length")
  if [ "$OPEN" -eq 0 ]; then
    EPIC_NUM=$(gh issue list --repo $REPO --label "epic,$EPIC_LABEL" --state open --json number --jq '.[0].number')
    [ -n "$EPIC_NUM" ] && [ "$EPIC_NUM" != "null" ] && gh issue close "$EPIC_NUM" --repo $REPO --comment "All stories completed."
  fi
fi
```

## Step 8: Optimize (when queue is empty)

Read and follow `.claude/skills/optimize/SKILL.md`.

## Step 9: Plan next epic (when queue is empty and optimization is done)

Read the codebase and `.knowledge/` knowledge graph. Identify the highest-impact improvement. Create an epic with 2-4 stories following `.knowledge/templates/epic.md` and `.knowledge/templates/story.md`.

Populate every story section — especially Knowledge (which concepts/conventions apply) and Tasks (which templates/patterns to follow). This minimizes token waste during implementation.

The next pipeline run picks up the first new story.
