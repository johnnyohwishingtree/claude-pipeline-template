---
name: local-pipeline
description: Local autonomous pipeline — implement, verify, learn on the local filesystem (no GitHub API needed)
argument-hint: "[task description]"
---

# /local-pipeline — Local Autonomous Pipeline

Same quality loop as `/pipeline` but works entirely on the local filesystem. No GitHub API, no PRs, no issues, no labels. Designed for Claude Desktop or environments without network access to GitHub.

## Step 1: Find work

If a task description is provided as argument, use that.

Otherwise, check for work in this priority order:
1. `.knowledge/gaps.md` — code fixes or knowledge updates to resolve
2. `TODO.md` in project root — manual task list (if it exists)
3. If nothing found → skip to Step 7 (optimize)

## Step 2: Set up branch

```bash
git checkout -b local/$(date +%Y%m%d-%H%M)-<short-task-description>
```

## Step 3: Implement

Read the relevant `.knowledge/` files for context, then implement:
1. Read knowledge files referenced by the task
2. Read source files in the area being modified
3. Implement following the conventions
4. One file at a time

## Step 4: Verify (up to 6 attempts)

<!-- CUSTOMIZE: your project's verification commands -->
```bash
pnpm build && pnpm typecheck && pnpm test
```

**Failure discipline:**
- If the same failure repeats, try a different approach
- If pre-existing, fix or add to gaps.md
- Run verification in the foreground — no background processes

## Step 5: Learn — update the knowledge graph

1. **Missing guidance?** → Add to `.knowledge/gaps.md` with test strategy
2. **New constraint?** → Create `.knowledge/policies/<scope>/<name>.md` (policy format) + structural test
3. **New business entity?** → Create `.knowledge/models/<name>.md` (model format)

## Step 6: Self-review against rubrics

Review your diff against `.knowledge/rubrics/`. Fix issues, re-verify.

## Step 7: Commit

```bash
git add <specific files>
git commit -m "<descriptive message>"
```

Do NOT merge to master — leave the branch for the user to review.

## Step 8: Optimize (when no tasks remain)

Read and follow `.claude/skills/optimize/SKILL.md`.

## Step 9: Report

Print a summary: what changed, tests added, knowledge updated, branch name.
