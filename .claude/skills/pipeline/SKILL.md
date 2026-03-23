---
name: pipeline
description: Autonomous story pipeline — implement, verify, merge, plan
argument-hint: "[--issue N]"
---

# /pipeline — Autonomous Story Pipeline

The self-building loop. Merges open PRs, implements pending stories, verifies quality, and plans new work when the queue is empty.

This file is the single source of truth for the pipeline. Claude Code scheduled tasks reference it directly:
```
Read CLAUDE.md for project context.
Read .claude/skills/pipeline/SKILL.md and follow every step.
```

## Usage
```
/pipeline              # Run one full cycle
/pipeline --issue N    # Implement a specific issue
```

## Full Cycle

### Step 1: Merge open PRs

Ensure the main branch is current before starting new work.

```bash
# CUSTOMIZE: replace OWNER/REPO with your GitHub repo
gh pr list --repo OWNER/REPO --state open --json number,title,headRefName --jq '.[]'
```

For each open PR:
1. Read the diff: `gh pr diff $NUMBER --repo OWNER/REPO`
2. If clean: approve and squash merge
3. If issues: checkout the branch, fix them, run verification, push, then approve and squash merge

After merging all PRs:
```bash
git checkout master && git pull origin master
```

### Step 2: Find next story

```bash
# If --issue N was specified, use that issue number
# Otherwise find the next pending story (lowest number first)
gh issue list --repo OWNER/REPO --label "story" --label "pending" --state open --json number,title --jq '.[0]'
```

If no pending stories, skip to **Step 6** (plan next epic).

### Step 3: Implement

```bash
NUMBER=<issue number>
gh issue edit $NUMBER --repo OWNER/REPO --remove-label "pending" --add-label "in-progress"
git fetch origin master && git checkout -b story/issue-$NUMBER origin/master
```

Read the issue body and implement it. The story body is your primary guide — it tells you exactly what to read and what to follow.

**Token-efficient implementation order:**
1. Read the story's **Context** section — these are the ONLY files you need to read. Do NOT explore the codebase beyond what's listed.
2. Read the story's **Patterns & Templates** section — follow these INSTEAD of reverse-engineering conventions from existing code.
3. Read the story's **Key Types** section — use these inline types instead of reading type definition files.
4. If the story doesn't have these sections (older stories), read the files listed in "Files to Create/Modify" plus the relevant templates from `.claude/templates/`.

**Always:**
- Run `pnpm typecheck` after every file change
- Run `pnpm test` before committing
- Never use `any` types — fix the root cause
- Every new module needs tests

### Step 3b: Self-update check

After implementing, check if your changes affect the pipeline itself:
- **Did you add new commands or flags?** Update this skill file to use them.
- **Did you change file structures?** Update the relevant templates.
- **Did you change quality criteria?** Update the relevant rubrics.

If any updates are needed, make them now — include the changes in your commit. The pipeline improves itself by keeping its own instructions current.

If you created or modified any skill files, evaluate them against `.claude/rubrics/skill-quality.md` before proceeding.

### Step 4: Verify and fix loop

This is the core quality gate. Keep iterating until verification passes or you exhaust all attempts.

**Attempt 1 of 6:**

Run all checks:
```bash
# CUSTOMIZE: replace with your project's verification commands
pnpm build && pnpm typecheck && pnpm test
```

If any fail, read the errors, fix them, and re-run. Do not proceed until all pass.

Read the decision:
- **All pass**: proceed to Step 5.
- **Any fail**: fix the issues and loop back to the top of Step 4. This counts as your next attempt.

**You have up to 6 attempts.** Use the error output from each failed run to guide your fixes.

### Step 4b: If verification fails after 6 attempts — discard

If after 6 attempts verification still fails:

1. Push the branch and create a PR anyway (so the work is visible), but do **NOT** merge:
   ```bash
   git add <specific files>
   git commit -m "WIP: #$NUMBER — failed verification after 6 attempts"
   git push -u origin story/issue-$NUMBER
   TITLE=$(gh issue view $NUMBER --repo OWNER/REPO --json title --jq .title)
   gh pr create --repo OWNER/REPO \
     --head story/issue-$NUMBER --base master \
     --title "WIP: $TITLE" \
     --body "Failed verification after 6 attempts. Needs human review. Ref: #$NUMBER"
   ```
2. Reset the issue so a future run can retry:
   ```bash
   gh issue edit $NUMBER --repo OWNER/REPO --remove-label "in-progress" --add-label "pending"
   gh issue comment $NUMBER --repo OWNER/REPO \
     --body "Pipeline failed to meet quality threshold after 6 attempts. WIP PR created for visibility. Resetting to pending."
   ```
3. **Stop.** Do not proceed to Step 5 or Step 6.

### Step 5: Push, PR, merge, close (only if Step 4 passed)

```bash
git add <specific files> # never git add -A
git commit -m "<descriptive message>

Closes #$NUMBER"
git push -u origin story/issue-$NUMBER
```

Create and merge the PR:
```bash
TITLE=$(gh issue view $NUMBER --repo OWNER/REPO --json title --jq .title)
gh pr create --repo OWNER/REPO \
  --head story/issue-$NUMBER --base master \
  --title "$TITLE" \
  --body "Closes #$NUMBER — implemented autonomously."

PR_NUMBER=$(gh pr list --repo OWNER/REPO --head story/issue-$NUMBER --json number --jq '.[0].number')
gh pr review $PR_NUMBER --repo OWNER/REPO --approve --body "Self-verified: all checks pass."
gh pr merge $PR_NUMBER --repo OWNER/REPO --squash
```

Close the issue:
```bash
gh issue edit $NUMBER --repo OWNER/REPO --remove-label "in-progress" --add-label "completed"
gh issue close $NUMBER --repo OWNER/REPO
git checkout master && git pull origin master
```

### Step 6: Plan next epic (when queue is empty)

Only runs when there are no pending stories left.

```bash
PENDING=$(gh issue list --repo OWNER/REPO --label "story" --label "pending" --state open --json number --jq 'length')
if [ "$PENDING" -gt 0 ]; then exit 0; fi
```

Analyze the project to identify the highest-impact improvement:
1. Read the codebase
2. Check recently closed issues to avoid duplicates:
   ```bash
   gh issue list --repo OWNER/REPO --state closed --limit 10 --json number,title
   ```
3. Look for: missing features mentioned in CLAUDE.md, test coverage gaps, error handling improvements

Read the templates before creating issues:
- `.claude/templates/epic.md` — structure for epic bodies
- `.claude/templates/story.md` — structure for story bodies

Create an epic and stories following the templates:
```bash
gh label create "epic:<slug>" --repo OWNER/REPO --color "0E8A16" --description "Epic: <title>" 2>/dev/null || true

gh issue create --repo OWNER/REPO \
  --title "Epic: <goal>" --label "epic" --label "epic:<slug>" \
  --body "<follow epic template: goal, context, story checklist, success criteria, out of scope>"

# IMPORTANT: populate ALL story template sections to minimize token waste:
#   - Context: list the minimum files/line-ranges needed
#   - Patterns & Templates: which patterns apply
#   - Key Types: inline the relevant type definitions
gh issue create --repo OWNER/REPO \
  --title "Story: <task>" --label "story" --label "pending" --label "epic:<slug>" \
  --body "<follow story template — every section>"

# Update epic body with actual issue numbers
gh issue edit <epic_number> --repo OWNER/REPO --body "..."
```

Story sizing rules:
- Each story produces a shippable, testable increment
- Combine tightly coupled small steps into one story
- Split steps that touch different layers
- If a story has no acceptance criteria beyond "files exist," merge it with another

If a story involves creating a new skill, read `.claude/templates/skill.md` and use it as the starting structure.

The next pipeline run will pick up the first new story.

## Token Optimization

- Don't read files you've already read in this session
- Use `pnpm typecheck` incrementally after each file
- Keep implementation focused — one story, one branch, one PR
- Read story Context section instead of exploring the codebase
- Read templates/patterns instead of reverse-engineering conventions

## Template Maintenance

<!-- canductor:skill-template-version:1 -->
<!-- Last updated: 2026-03-23 -->
<!-- Update this skill when: new verification commands, new label conventions, or the pipeline loop changes -->
