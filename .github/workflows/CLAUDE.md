# .github/workflows/ — GitHub Actions Workflows

## Architecture

See `docs/pipeline-architecture.md` for the full pipeline design, workflow interactions, and edge cases.

The pipeline follows a **Temporal-inspired** model:
- **Workflows** = story lifecycle per issue (orchestrate.yml)
- **Activities** = individual GHA workflow runs (claude.yml, verify-and-fix.yml, etc.)
- **Steps** = steps inside a GHA job

## Rules

### 1. Use the pipeline TypeScript CLI — never inline raw commands

Every workflow step that interacts with git or the GitHub API must use the pipeline CLI. See `.github/scripts/CLAUDE.md` for the full mapping.

```yaml
# BAD — raw dispatch
gh workflow run auto-merge.yml --repo "$REPO" --ref master -f pr_number="$N"

# GOOD — pipeline CLI
npx tsx .github/scripts/lib/cli/pipeline.ts dispatch "auto-merge.yml" -f pr_number="$N"
```

### 2. Use setup-pipeline-ts action

Every job that uses the pipeline CLI must have `setup-pipeline-ts` and a checkout step:
```yaml
jobs:
  my-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pipeline-ts
      - run: |
          npx tsx .github/scripts/lib/cli/pipeline.ts setup-git-auth
          npx tsx .github/scripts/lib/cli/pipeline.ts dispatch "auto-merge.yml" -f pr_number="42"
        env:
          GH_TOKEN: ${{ secrets.GH_PAT }}
```

### 3. Use GH_PAT for cross-workflow triggers

`GITHUB_TOKEN` cannot trigger other workflows or push when `.github/workflows/` files differ. Always use `secrets.GH_PAT` for:
- `dispatch` calls
- `approve-and-merge` calls (GITHUB_TOKEN approvals don't emit events)
- Pushing branches that modify workflow files

### 4. GITHUB_TOKEN approvals don't trigger events

When a workflow approves a PR using `${{ github.token }}`, GitHub suppresses the `pull_request_review` event. After any GITHUB_TOKEN approval, explicitly dispatch auto-merge:
```yaml
npx tsx .github/scripts/lib/cli/pipeline.ts approve-and-merge "$PR_NUM" "Auto-approved: ..." "$REPO"
```

### 5. Never put @claude or @gemini in automated comments

Comments containing `@claude` or `@gemini` trigger new workflow runs. Bot status comments, give-up messages, and error reports must NEVER contain these triggers.

### 6. Concurrency groups must include author

PR comment-triggered workflows must include `github.event.comment.user.login` in the concurrency group to prevent bot status comments from cancelling real runs.

### 7. Update pipeline-architecture.md

When modifying any workflow file, update `docs/pipeline-architecture.md` to match. This is enforced by `.claude/rules/pipeline-docs.md`.

## Workflow Inventory

| Workflow | Trigger | Role |
|----------|---------|------|
| `orchestrate.yml` | Issue labeled `story` | Story lifecycle orchestrator |
| `claude.yml` | Issue/PR comments, workflow_dispatch | Claude agent implementation |
| `gemini.yml` | Issue/PR comments | Gemini agent implementation |
| `verify-and-fix.yml` | workflow_dispatch | Reusable verify + fix loop (configurable attempts) |
| `auto-merge.yml` | workflow_dispatch, workflow_run | Merge gate evaluator |
| `review-guardian.yml` | workflow_run, issue_comment, PR review | Review + auto-approve |
| `review-relay.yml` | PR review submitted | Relay review feedback to fix workflow |
| `review-fix.yml` | workflow_dispatch | Apply review feedback fixes, dispatch verify-and-fix |
| `resolve-conflicts.yml` | workflow_dispatch | Merge conflict resolution |
| `pipeline-doctor.yml` | workflow_dispatch | Diagnose stuck pipelines |
| `watcher.yml` | schedule (every 20min) | Monitor stale PRs and issues |
| `test.yml` | push, PR, workflow_dispatch | Unit tests + typecheck; dispatches verify-and-fix on failure |
| `daily-planner.yml` | workflow_dispatch | Story planning (manual) |
| `agent-switcher.yml` | workflow_dispatch | Switch between Claude/Gemini |
| `pipeline-toggle.yml` | workflow_dispatch | Enable/disable pipeline |
