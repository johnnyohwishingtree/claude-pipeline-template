# Claude Autonomous Pipeline Template

A GitHub template repository that sets up a fully autonomous AI development pipeline using Claude Code.

## What This Gives You

An end-to-end autonomous development loop:

```
@claude comment on issue
  -> Claude implements on claude/issue-N branch
    -> Pushes to tmp/ branch (no checks yet)
      -> verify-merge runs tests on tmp/
        -> Pass: merge tmp/ into claude/issue-N, create PR, auto-merge
        -> Fail: Claude fixes with fresh context, re-verify (up to 3x)
  -> PR created
    -> Bot reviewers (Gemini/Copilot) review the PR
      -> review-relay forwards feedback to Claude
    -> PR merges -> orchestrator triggers next story
```

## Quick Start

### 1. Use this template

Click **"Use this template"** on GitHub to create a new repo.

### 2. Set up secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token from Claude Code |
| `GH_PAT` | GitHub Personal Access Token with `repo`, `issues`, `pull-requests` scopes |

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

### 3. Customize for your project

1. **Edit `CLAUDE.md`** — Replace the skeleton with your project's context, architecture, and conventions
2. **Edit workflow TODO sections** — Update language runtime, dependencies, and test commands in:
   - `.github/workflows/claude.yml` (setup + allowed tools)
   - `.github/workflows/verify-merge.yml` (setup + test commands)
   - `.github/workflows/test.yml` (setup + test commands)
3. **Edit `.claude/skills/`** — Customize or add skills relevant to your project

### 4. Configure repository settings

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

### 5. Start the pipeline

Either:
- **Manual:** Create an issue and comment `@claude` on it
- **Epic pipeline:** Use `/epic-planner` to create an epic with stories, then comment `@claude` on the first story
- **Automatic:** Trigger the planner via Actions > Planner > Run workflow

## How It Works

### The temp branch pattern

Claude never pushes directly to the PR branch. Instead:

1. **`claude.yml`** — Claude works on `claude/issue-N` branch, then pushes to `tmp/claude-<run_id>`
2. **`verify-merge.yml`** — Runs tests on the temp branch:
   - **Pass:** Merges temp into `claude/issue-N`, deletes temp, creates PR with auto-merge
   - **Fail:** Claude fixes with fresh context on the temp branch, re-triggers verify (up to 3 attempts)
   - **Give up:** Comments on the issue, cleans up stale branches

This ensures only verified code lands on the PR branch, and fix attempts get fresh context instead of accumulating a polluted conversation.

### Bot comment isolation

The Claude Code Action posts status comments ("working…", plan updates) which trigger `issue_comment` events. The concurrency group includes the comment author (`claude-245-username` vs `claude-245-claude[bot]`) so bot comments never cancel or interfere with the real run.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `claude.yml` | `@claude` comment | Runs Claude Code, pushes to temp branch, triggers verify-merge |
| `verify-merge.yml` | Dispatched by claude.yml | Runs tests, merges if passing, fixes if failing (up to 3 attempts) |
| `test.yml` | Push/PR to default branch | Runs tests on PRs |
| `orchestrate.yml` | PR merged | Closes story, triggers next one in the epic |
| `review-relay.yml` | Bot review submitted | Relays reviewer feedback to Claude |
| `watcher.yml` | Every 30 min | Re-triggers stuck stories, cleans up stale branches |
| `daily-planner.yml` | Weekends (configurable) | Creates new epics with stories |

## Safety Mechanisms

- **Bot isolation:** Bot status comments get separate concurrency groups — can't cancel real runs
- **Temp branch pattern:** Only verified code reaches the PR branch
- **Fix attempt limit:** 3 attempts per verify-merge before giving up
- **Story retry limit:** 5 watcher retries before requiring human review
- **Review relay limit:** 3 rounds before escalating to human
- **Grace period:** 30-minute cooldown before watcher re-triggers
- **Consecutive failure detection:** Orchestrator pauses after 3+ unmerged PRs
- **Stale branch cleanup:** Watcher and give-up job clean up orphan `tmp/` branches

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

Update the test/lint commands in three places:
- `test.yml` — the CI check
- `verify-merge.yml` — the verify job and capture-errors step
- `claude.yml` — the allowed_tools (add your test runner)

### Changing the planner schedule

Edit `daily-planner.yml` cron expressions. Default is weekends only. Set to daily or on-demand only.

### Disabling auto-planning

Remove or disable `daily-planner.yml` and trigger stories manually with `@claude` comments.

## License

MIT
