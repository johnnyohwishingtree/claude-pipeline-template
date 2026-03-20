# .github/scripts/ — Pipeline TypeScript Library

## Architecture

This folder contains shared TypeScript modules for GitHub Actions workflows, following a **Temporal-inspired** design where reusable "activities" are composed into workflow orchestrations.

| Module | Role |
|--------|------|
| `lib/github.ts` | Octokit-based typed GitHub API client |
| `lib/git.ts` | Local git operations via child_process |
| `lib/merge-gate.ts` | Merge readiness evaluator (6 conditions) |
| `lib/state-machine.ts` | Pipeline state persistence (JSON in GitHub issue comments) |
| `lib/workflow.ts` | Temporal-like activity runner with state tracking and retry policies |
| `lib/verify-checks.ts` | CI check verification (lint, typecheck, bundle, test, native deps) |
| `lib/ci-dispatch.ts` | CI failure dispatch (label check, failed items extraction, verify-and-fix dispatch) |
| `lib/watcher.ts` | Pipeline watcher logic (slot counting, PR health, story retrigger, epic staleness, orphan cleanup) |
| `lib/doctor.ts` | Pipeline doctor evidence collection and failure reproduction |
| `lib/review-guardian.ts` | Review guardian auto-approve and review decision logic |
| `lib/cli/pipeline.ts` | Unified CLI — replaces all lib.sh functions |
| `lib/cli/verify-checks.ts` | CLI wrapper for verify-checks |
| `lib/cli/evaluate-merge-gate.ts` | CLI wrapper for merge-gate evaluation |
| `lib/cli/state-machine.ts` | CLI wrapper for state machine |
| `lib/cli/activity.ts` | CLI wrapper for activity runner |

## Rules

### Always use the pipeline CLI instead of inline commands

When writing workflow steps, **never** use raw `gh` or `git` commands for operations that the pipeline CLI already provides.

| Instead of... | Use... |
|---------------|--------|
| `gh workflow run X.yml ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts dispatch "X.yml" -f key=val` |
| `git remote set-url origin ...` + `git config ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts setup-git-auth` |
| `gh pr view N --json reviews ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts count-approvals N [repo]` |
| `gh api graphql ... reviewThreads ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts count-unresolved-threads N [repo]` |
| `git fetch && git merge origin/master` | `npx tsx .github/scripts/lib/cli/pipeline.ts merge-master` |
| `git status && git add -u && git commit` | `npx tsx .github/scripts/lib/cli/pipeline.ts commit "message" [co-author]` |
| `git fetch && git push ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts push "branch" [pre-push-head]` |
| `gh issue comment N ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts comment N "body" [repo]` |
| `gh run list --workflow X ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts is-workflow-active "X.yml" N [repo]` |
| `gh api pulls/N/comments ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts count-critical-comments N [repo]` |
| `gh pr review --approve` + dispatch | `npx tsx .github/scripts/lib/cli/pipeline.ts approve-and-merge N "body" [repo]` |
| `gh issue list --label story ...` | `npx tsx .github/scripts/lib/cli/pipeline.ts get-next-pending-story "label" [repo]` |
| Comment with @agent ... | `npx tsx .github/scripts/lib/cli/pipeline.ts trigger-story-agent N "agent" [suffix]` |
| Inline CI failure dispatch (label check + failed items + comment + dispatch) | `npx tsx .github/scripts/lib/cli/pipeline.ts ci-dispatch-pr N branch run_id run_url checks [extra]` |
| Inline master failure dispatch (create branch + push + dispatch) | `npx tsx .github/scripts/lib/cli/pipeline.ts ci-dispatch-master run_id run_url checks prefix [extra]` |
| Inline watcher shell (~530 lines of health checks) | `npx tsx .github/scripts/lib/cli/pipeline.ts watcher-run maxSlots staleMin epicStaleH` |
| Inline doctor evidence collection (~330 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts doctor-collect-evidence issueNum [failedRunIds]` |
| Inline doctor failure reproduction (~60 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts doctor-reproduce workBranch` |
| Inline review-guardian bot review decision (~60 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts guardian-bot-review pr reviewer` |
| Inline review-guardian post-wait check (~20 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts guardian-post-wait pr` |
| Inline review-guardian Claude review decision (~35 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts guardian-claude-review pr body` |
| Inline review-guardian ensure-review decision (~80 lines) | `npx tsx .github/scripts/lib/cli/pipeline.ts guardian-ensure-review pr` |

### How to use the pipeline CLI in a workflow

Every job using the CLI must have `setup-pipeline-ts` and a checkout step:

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
          GH_PAT: ${{ secrets.GH_PAT }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

Requirements:
- The job must checkout `.github/scripts/` (via `actions/checkout` or sparse-checkout)
- `setup-pipeline-ts` must run before any `npx tsx` calls
- `$GH_TOKEN` or `$GH_PAT` must be set in the step's `env`
- `$GITHUB_REPOSITORY` is set automatically by GitHub Actions

### CLI command reference

```
npx tsx .github/scripts/lib/cli/pipeline.ts <command> [args...]

GitHub API:
  comment <issue> <body> [repo]
  dispatch <workflow> [-f key=value]... [--ref ref]
  approve-and-merge <pr> <body> [repo]
  get-pr-number <event_name>
  count-approvals <pr> [repo]
  count-unresolved-threads <pr> [repo]
  resolve-all-threads <pr> [repo]
  check-ci-status <sha> [repo]
  is-workflow-active <workflow> <issue> [repo]
  count-critical-comments <pr> [repo]
  get-next-pending-story <epic_label> [repo]
  trigger-story-agent <issue> [agent] [suffix]

CI Dispatch:
  ci-dispatch-pr <pr> <branch> <run_id> <run_url> <checks> [extra_context]
  ci-dispatch-master <run_id> <run_url> <checks> <branch_prefix> [extra_context]

Watcher:
  watcher-run <max_slots> <stale_minutes> <epic_stale_hours>

Doctor:
  doctor-collect-evidence <issue_number> [failed_run_ids]
  doctor-reproduce <work_branch>

Review Guardian:
  guardian-bot-review <pr> <reviewer>
  guardian-post-wait <pr>
  guardian-claude-review <pr> <comment_body>
  guardian-ensure-review <pr>

Git:
  setup-git-auth
  merge-master
  commit <message> [co-author]
  push <branch> [pre-push-head]
```

### Testing

Tests are in vitest:

```bash
cd .github/scripts && npx vitest
```

When adding new pipeline functions:
1. Add the function to the appropriate module in `lib/`
2. Add a CLI command in `lib/cli/pipeline.ts`
3. Write vitest tests in `__tests__/lib/`
4. Export from `lib/index.ts`

### Bug fix TDD (mandatory)

When fixing ANY pipeline bug — whether in scripts or workflow YAML:
1. **Write a failing vitest test first**
2. Verify it fails on the broken state
3. Fix the bug
4. Verify the test passes
5. Run `npx vitest` for full suite

This applies to ALL pipeline bugs, not just function-level bugs.
