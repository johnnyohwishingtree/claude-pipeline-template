# Claude Autonomous Pipeline Template

A GitHub template repository that sets up a fully autonomous AI development pipeline using Claude Code.

## What This Gives You

An end-to-end autonomous development loop:

```
@claude comment on issue
  -> Claude implements on claude/issue-N branch
    -> Pushes to tmp/ branch (no checks yet)
      -> verify-merge runs tests on tmp/
        -> Pass: merge tmp/ into claude/issue-N, create PR
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
2. **Edit workflow TODO sections** — Update language runtime, dependencies, and test commands in:
   - `.github/workflows/claude.yml` (setup + allowed tools)
   - `.github/workflows/verify-merge.yml` (setup + test commands)
   - `.github/workflows/test.yml` (setup + test commands)
   - `.github/workflows/review-fix.yml` (setup + verify step)
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

## How It Works

### The temp branch pattern

Claude never pushes directly to the PR branch. Instead:

1. **`claude.yml`** — Claude works on `claude/issue-N` branch, then pushes to `tmp/claude-<run_id>`
2. **`verify-merge.yml`** — Runs tests on the temp branch:
   - **Pass:** Merges temp into `claude/issue-N`, deletes temp, creates PR
   - **Fail:** Claude fixes with fresh context on the temp branch, re-triggers verify (up to 6 attempts)
   - **Give up:** Comments on the issue, cleans up stale branches

This ensures only verified code lands on the PR branch, and fix attempts get fresh context instead of accumulating a polluted conversation.

### Resume from existing work

When Claude is triggered on an issue that already has work from a previous run, `claude.yml` automatically finds the branch with the most commits ahead of the default branch and resumes from there. No work is lost across retries or timeouts.

### Timeout rescue

If a Claude run times out (60 minute limit), the rescue step saves all in-progress work to the temp branch and posts a comment with instructions to resume.

### Code review flow

```
PR created
  -> Gemini/Copilot posts review
    -> review-relay.yml detects bot review
      -> Dispatches review-fix.yml (Claude with full Edit/Write permissions)
        -> Claude fixes feedback, resolves threads, pushes
    -> review-guardian.yml auto-approves (if no critical/high issues)
  -> auto-merge.yml merges when: tests pass + approved + threads resolved
```

> **Why review-fix instead of @claude PR comments?** `claude-code-action@v1` strips Edit/Write tools when triggered from PR comments — only read tools are allowed. `review-fix.yml` uses `workflow_dispatch` which gives Claude full tool access.

### Bot comment isolation

The Claude Code Action posts status comments ("working...", plan updates) which trigger `issue_comment` events. The concurrency group includes the comment author (`claude-245-username` vs `claude-245-claude[bot]`) so bot comments never cancel or interfere with the real run.

## Workflows

### Core Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `claude.yml` | `@claude` comment | Runs Claude, pushes to temp branch, triggers verify-merge |
| `verify-merge.yml` | Dispatched by claude.yml | Runs tests, merges if passing, fixes if failing (up to 6 attempts) |
| `test.yml` | Push/PR to default branch | Runs tests; notifies Claude on failure for claude/ branches |

### Code Review

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `review-relay.yml` | Bot review submitted | Dispatches review-fix with feedback (up to 3 rounds) |
| `review-fix.yml` | Dispatched by review-relay | Claude fixes review feedback with full permissions |
| `review-guardian.yml` | CI complete, review submitted | Auto-approves after review; requests Claude fallback if no review |

### Merge & Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `auto-merge.yml` | Tests/review/push events | Single gate: merges when tests + approval + threads resolved |
| `orchestrate.yml` | PR merged | Closes story, triggers next one in the epic |
| `resolve-conflicts.yml` | Push to default branch | Auto-resolves merge conflicts on open PRs |

### Monitoring & Planning

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `watcher.yml` | Every 20 min | Re-triggers stuck stories, detects failing CI, cleans orphan PRs |
| `daily-planner.yml` | Weekends (configurable) | Creates new epics with stories |
| `pipeline-toggle.yml` | Manual | Enable/disable the autonomous pipeline |

## Safety Mechanisms

- **Bot isolation:** Bot status comments get separate concurrency groups — can't cancel real runs
- **Temp branch pattern:** Only verified code reaches the PR branch
- **Fix attempt limit:** 6 attempts per verify-merge before giving up
- **No-changes detection:** If Claude produces no changes, skips remaining attempts
- **Permission denial detection:** Aborts fix loop if Claude hits >5 permission denials
- **Timeout rescue:** Saves work and triggers next attempt on timeout
- **Cross-attempt context:** `.claude-fix-log.md` prevents repeating failed approaches
- **Story retry limit:** 5 watcher retries before requiring human review
- **Review relay limit:** 3 rounds before escalating to human
- **Review-fix dispatch:** Full Edit/Write permissions (not restricted @claude PR comments)
- **Grace period:** 15-minute cooldown before watcher re-triggers
- **Consecutive failure detection:** Orchestrator pauses after 3+ unmerged PRs
- **Orphan PR cleanup:** Watcher closes PRs with no linked story
- **Auto-conflict resolution:** Infrastructure/lock files take default branch version
- **Event-driven approval:** Auto-approve only flows through review event hooks

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

Update the test/lint commands in these places:
- `test.yml` — the CI check
- `verify-merge.yml` — the verify job checks
- `review-fix.yml` — the verify step (optional)

### Changing the planner schedule

Edit `daily-planner.yml` cron expressions. Default is weekends only. Set to daily or on-demand only.

### Disabling auto-planning

Remove or disable `daily-planner.yml` and trigger stories manually with `@claude` comments.

### Using a different agent

Set the `PREFERRED_AGENT` repository variable to `gemini` to use Gemini instead of Claude for story triggers. Both agents use the same skills and conventions.

## License

MIT
