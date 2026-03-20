# Claude Autonomous Pipeline Template

A GitHub template repository that sets up a fully autonomous AI development pipeline using Claude Code.

## What This Gives You

An end-to-end autonomous development loop:

```
@claude comment on issue
  -> Claude implements on claude/issue-N branch
    -> verify-and-fix runs tests on tmp/vf-* branch
      -> Pass: merge into claude/issue-N, create PR
      -> Fail: Claude fixes with fresh context, re-verify (up to 6x)
  -> PR created
    -> Bot reviewers (Gemini/Copilot) review the PR
      -> review-relay dispatches review-fix to address feedback
    -> review-guardian auto-approves after review
    -> auto-merge merges when all conditions met
    -> orchestrator triggers next story
```

## Quick Start

### 1. Use this template

Click **"Use this template"** on GitHub to create a new repo.

### 2. Set up secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token from Claude Code |
| `GH_PAT` | GitHub Personal Access Token with `repo`, `workflow`, `issues`, `pull-requests` scopes |

> **Important:** `GH_PAT` must include the `workflow` scope. Without it, Claude can't push branches when `.github/workflows/` files differ from the default branch.

<details>
<summary><strong>How to get the Claude token</strong></summary>

```bash
# Make sure you're logged in to Claude Code first
claude auth status

# Extract and store the token
CREDS=$(security find-generic-password -s "Claude Code-credentials" -a "$(whoami)" -w)

echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])" \
  | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo OWNER/REPO
```

Replace `OWNER/REPO` with your repository (e.g. `myuser/myproject`).

</details>

### 3. Set up variables (optional)

Go to **Settings > Secrets and variables > Actions > Variables**:

| Variable | Default | Description |
|----------|---------|-------------|
| `PREFERRED_AGENT` | `claude` | Which agent to trigger for stories (`claude` or `gemini`) |
| `PIPELINE_ENABLED` | `true` | Set to `false` to disable the autonomous pipeline |

### 4. Customize for your project

1. **Edit `CLAUDE.md`** — Replace the skeleton with your project's context, architecture, and conventions
2. **Edit workflow test commands** — Update language runtime, dependencies, and test commands in:
   - `.github/workflows/test.yml` — CI checks (typecheck + test)
   - `.github/workflows/verify-and-fix.yml` — verify job checks
   - `.github/scripts/lib/verify-checks.ts` — TypeScript check runner (lint, typecheck, test)
3. **Edit `.claude/skills/`** — Customize or add skills relevant to your project

### 5. Configure repository settings

Run the setup script:

```bash
./scripts/setup-repo.sh owner/repo-name
```

This configures:

| Setting | Why it's needed |
|---------|----------------|
| **Allow auto-merge** | PRs merge automatically after checks pass |
| **Delete branch on merge** | Cleans up `claude/*` branches after merge |
| **Require pull requests** | Prevents direct pushes to the default branch |
| **Require `test` status check** | PRs can't merge with failing CI |
| **Require review thread resolution** | All review comments must be resolved before merge |
| **Pipeline labels** | `pending`, `in-progress`, `completed`, `pipeline-stuck`, `epic`, `story` |

<details>
<summary>Manual setup (if you prefer not to use the script)</summary>

**Repo settings** (Settings > General > Pull Requests):
- Enable "Allow auto-merge"
- Enable "Automatically delete head branches"

**Branch ruleset** (Settings > Rules > Rulesets > New ruleset):
- Name: `No Human Merge to main`
- Target: Default branch
- Rules:
  - Restrict deletions
  - Block force pushes
  - Require pull request: 0 approvals, require conversation resolution
  - Require status checks: `test`

**Labels** (Issues > Labels):
Create: `pending`, `in-progress`, `completed`, `pipeline-stuck`, `epic`, `story`

</details>

### 6. Start the pipeline

Either:
- **Manual:** Create an issue and comment `@claude` on it
- **Epic pipeline:** Use `/epic-planner` to create an epic with stories, then comment `@claude` on the first story
- **Automatic:** Trigger the planner via Actions > Planner > Run workflow

## Architecture

### TypeScript Pipeline CLI

All pipeline logic is implemented in TypeScript with full type safety and Vitest tests. Workflows call a unified CLI instead of inline shell commands:

```yaml
# Instead of raw gh/git commands:
npx tsx .github/scripts/lib/cli/pipeline.ts dispatch "auto-merge.yml" -f pr_number="42"
npx tsx .github/scripts/lib/cli/pipeline.ts comment 123 "Status update"
npx tsx .github/scripts/lib/cli/pipeline.ts setup-git-auth
```

Key modules in `.github/scripts/lib/`:

| Module | Purpose |
|--------|---------|
| `github.ts` | Typed GitHub API client (Octokit REST + GraphQL) |
| `git.ts` | Local git operations (auth, merge, commit, push) |
| `merge-gate.ts` | Evaluates 6 merge conditions |
| `verify-checks.ts` | Runs lint, typecheck, test checks |
| `watcher.ts` | Pipeline health monitoring |
| `doctor.ts` | Failure diagnosis and reproduction |
| `review-guardian.ts` | Review decision logic |
| `state-machine.ts` | Durable state in issue comments |
| `workflow.ts` | Temporal-like activity runner |
| `ci-dispatch.ts` | CI failure dispatch to verify-and-fix |

Run `cd .github/scripts && pnpm test` for the pipeline test suite.

### Composite Actions

| Action | Purpose |
|--------|---------|
| `setup-auth` | Git remote URL auth + user identity |
| `setup-node` | Node.js 20 + pnpm + `pnpm install` |
| `setup-pipeline-ts` | Node.js 20 + pnpm + pipeline TS deps |
| `merge-master` | Fetch + merge master with conflict strategy |

### The temp branch pattern

Claude never pushes broken code to the PR branch. Instead:

1. **`claude.yml`** — Claude works on `claude/issue-N` branch, then pushes to `tmp/claude-<run_id>`
2. **`verify-and-fix.yml`** — Runs tests on a temp branch (`tmp/vf-*`):
   - **Pass:** Merges temp into `claude/issue-N`, deletes temp, creates PR
   - **Fail:** Claude fixes with fresh context on the temp branch, re-triggers verify (up to 6 attempts)
   - **Give up:** Triggers pipeline-doctor for diagnosis

This ensures only verified code lands on the PR branch.

## Workflows

### Core Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `claude.yml` | `@claude` comment | Runs Claude, pushes to temp branch, triggers verify-and-fix |
| `gemini.yml` | `@gemini` comment | Runs Gemini agent on issue or PR |
| `verify-and-fix.yml` | Dispatched by workflows | Verify + fix loop with temp branches (up to 6 attempts) |
| `test.yml` | Push/PR to master / manual | CI checks (typecheck, test); dispatches verify-and-fix on failure |

### Code Review

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `review-relay.yml` | Bot review submitted | Dispatches review-fix with feedback (up to 3 rounds) |
| `review-fix.yml` | Dispatched by review-relay | Claude fixes review feedback with full permissions |
| `review-guardian.yml` | CI complete, review submitted | Auto-approves after review; requests Claude fallback if no review |

### Merge & Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `auto-merge.yml` | Tests/review/push events | Single gate: merges when 6 conditions met |
| `orchestrate.yml` | PR merged | Closes story, triggers next one in the epic |
| `resolve-conflicts.yml` | Push to master / manual | Auto-resolves merge conflicts on open PRs |

### Monitoring & Planning

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `watcher.yml` | Every 20 min / manual | Re-triggers stuck stories, detects failing CI, cleans orphan PRs |
| `pipeline-doctor.yml` | verify-and-fix give-up / watcher | Diagnoses failures, collects evidence |
| `daily-planner.yml` | Manual | Creates new epics with stories |
| `pipeline-toggle.yml` | Manual | Enable/disable the autonomous pipeline |
| `agent-switcher.yml` | Manual / comment | Switch between Claude and Gemini agents |

## Auto-Merge Gate (6 Conditions)

PRs merge only when ALL conditions are met:
1. Tests workflow passed
2. E2E passed (if configured)
3. PR has at least one approval (owner PRs implicitly approved)
4. No unresolved review threads
5. No active review-fix runs
6. Branch up to date with master

## Safety Mechanisms

- **Temp branch pattern:** Only verified code reaches the PR branch
- **Bot isolation:** Bot status comments get separate concurrency groups
- **Fix attempt limit:** Configurable attempts per verify-and-fix before giving up
- **No-changes detection:** If Claude produces no changes, skips remaining attempts
- **Permission denial detection:** Aborts fix loop if Claude hits >5 permission denials
- **Timeout rescue:** Saves work and triggers next attempt on timeout
- **Cross-attempt context:** `.claude-fix-log.md` prevents repeating failed approaches
- **Story retry limit:** Watcher retries before requiring human review
- **Review relay limit:** 3 rounds before escalating to human
- **Review-fix dispatch:** Full Edit/Write permissions (not restricted @claude PR comments)
- **Grace period:** 15-minute cooldown before watcher re-triggers
- **Consecutive failure detection:** Orchestrator pauses after 3+ unmerged PRs
- **Pipeline doctor:** Diagnoses failures and collects evidence for stuck pipelines
- **Orphan PR cleanup:** Watcher closes PRs with no linked story
- **Auto-conflict resolution:** Infrastructure/lock files take default branch version

## Skills

Skills are reusable prompts that guide Claude's implementation approach. See `.claude/skills/`.

| Skill | Purpose |
|-------|---------|
| `/epic-planner` | Break a goal into Epic + Stories |
| `/plan-feature` | Plan and implement a new feature |
| `/test-suite` | Find and fix test coverage gaps |
| `/organize` | Reorganize file structure |
| `/cleanup` | Remove unused files |
| `/update-architecture` | Update architecture diagrams |
| `/refactor-design` | Audit and fix architecture issues |
| `/qa` | Walk through the app and document bugs |

## Customization Guide

### Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md`
2. Add the skill to the dropdown in `.github/ISSUE_TEMPLATE/story.yml`
3. Reference it in `CLAUDE.md`

### Changing the test command

Update test/lint commands in:
- `.github/workflows/test.yml` — CI check jobs
- `.github/scripts/lib/verify-checks.ts` — the TypeScript check runner
- `.github/scripts/lib/cli/verify-checks.ts` — CLI wrapper

### Adding E2E tests

Create your own `e2e-smoke.yml` workflow following the pattern in `test.yml`. The `verify-and-fix.yml` already supports `checks: "e2e"` and `checks: "all"` modes — you just need a workflow that dispatches `ci-dispatch-pr`/`ci-dispatch-master` on failure.

### Adding framework-specific checks

Edit `.github/scripts/lib/verify-checks.ts`:
- The `bundle` check is a no-op by default — add your bundler (metro, webpack, vite, etc.)
- The `native_deps` check is a no-op by default — add platform-specific dependency checks

### Changing the planner schedule

Edit `daily-planner.yml` to add cron expressions, or keep it manual-only (default).

### Using a different agent

Set the `PREFERRED_AGENT` repository variable to `gemini` to use Gemini instead of Claude for story triggers. Both agents use the same skills and conventions.

## License

MIT
