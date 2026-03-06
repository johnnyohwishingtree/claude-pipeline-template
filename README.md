# Claude Autonomous Pipeline Template

A GitHub template repository that sets up a fully autonomous AI development pipeline using Claude Code.

## What This Gives You

An end-to-end autonomous development loop:

```
Planner (weekends) creates Epic + Stories
  -> @claude comment triggers Claude Code Action
    -> Claude implements, commits, pushes, creates PR
      -> Tests run; if fail, Claude auto-fixes (up to 3 attempts)
        -> Bot reviewers (Gemini/Copilot) review the PR
          -> Review relay forwards feedback to Claude
            -> PR merges -> Orchestrator triggers next story
              -> Watcher monitors health, re-triggers stuck work
```

## Quick Start

### 1. Use this template

Click **"Use this template"** on GitHub to create a new repo.

### 2. Set up secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | From [Claude Code](https://claude.ai/code) — enables the Claude Code Action |
| `GH_PAT` | GitHub Personal Access Token with `repo`, `issues`, `pull-requests` scopes |

### 3. Customize for your project

1. **Edit `CLAUDE.md`** — Replace the skeleton with your project's context, architecture, and conventions
2. **Edit `.github/workflows/test.yml`** — Update the language, dependencies, and test command for your stack
3. **Edit `.github/workflows/claude.yml`** — Update `pip install` to match your dependencies
4. **Edit `.github/workflows/daily-planner.yml`** — Customize the improvement categories for your project
5. **Edit `.github/ISSUE_TEMPLATE/story.yml`** — Update the skill dropdown to match your skills
6. **Edit `.claude/skills/`** — Customize or add skills relevant to your project

### 4. Configure repository settings

The pipeline requires specific repo settings to function correctly. Run the setup script:

```bash
./scripts/setup-repo.sh owner/repo-name
```

This configures:

| Setting | Why it's needed |
|---------|----------------|
| **Allow auto-merge** | PRs merge automatically after checks pass |
| **Delete branch on merge** | Cleans up `claude/*` branches after merge |
| **Require pull requests** | Prevents direct pushes to master |
| **Require `test` status check** | PRs can't merge with failing CI |
| **Require review thread resolution** | All review comments must be resolved before merge |
| **Block branch deletion/force push** | Protects the default branch |
| **Required labels** | Creates `pending`, `in-progress`, `completed`, `pipeline-stuck`, `epic`, `story` labels |

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
- **Manual:** Create an issue with `epic` + `story` labels and comment `@claude` on it
- **Automatic:** Trigger the planner via Actions > Planner > Run workflow

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `claude.yml` | `@claude` comment | Runs Claude Code to implement work |
| `test.yml` | Push/PR to main | Runs tests, notifies Claude on failure |
| `orchestrate.yml` | PR merged | Closes story, triggers next one |
| `watcher.yml` | Every 20 min | Health monitoring, re-triggers stuck work |
| `review-relay.yml` | Bot review submitted | Relays reviewer feedback to Claude |
| `daily-planner.yml` | Weekends (configurable) | Creates new epics with stories |

## Safety Mechanisms

- **Concurrency limit:** Max 3 Claude workflows at once
- **Test fix limit:** 3 auto-fix attempts before requiring human review
- **Story retry limit:** 5 attempts before creating alert issue
- **Review relay limit:** 3 rounds before escalating to human
- **Grace period:** 15-minute cooldown before re-triggering stalled work
- **Backlog gates:** Won't create new epics if 3+ are already open
- **Auto-push safety net:** Commits Claude's forgotten changes automatically
- **Consecutive failure detection:** Pauses pipeline after 3+ unmerged PRs

## Skills

Skills are reusable prompts that guide Claude's implementation approach. See `.claude/skills/` for examples.

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
3. Reference it in `CLAUDE.md` and the planner's improvement categories

### Changing the test command

Edit `test.yml` line with the test runner. Examples:
- Python: `python -m pytest tests/ -v`
- Node: `npm test`
- Go: `go test ./...`
- Rust: `cargo test`

### Changing the planner schedule

Edit `daily-planner.yml` cron expressions. Default is weekends only. Set to run daily or on-demand only.

### Disabling auto-planning

Remove or disable `daily-planner.yml` and trigger stories manually with `@claude` comments.

## Architecture

See [docs/architecture/](docs/architecture/) for diagrams (if your project uses them).

## License

MIT
