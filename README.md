# Claude Pipeline Template

A self-building project pipeline powered by Claude Code scheduled tasks. No GitHub Actions, no CI runners — just Claude reading issues, writing code, and merging PRs.

## How It Works

1. A **scheduled task** runs the `/pipeline` skill on a regular interval
2. The pipeline merges any open PRs, picks the next pending story, implements it, verifies quality, and pushes a PR
3. When the story queue is empty, it plans the next epic (analyzes the codebase, creates issues)
4. Repeat

The entire loop — planning, coding, testing, reviewing, merging — runs autonomously.

## What's Included

```
.claude/
├── skills/
│   └── pipeline/SKILL.md    # The autonomous pipeline loop
├── templates/                # Structure templates for artifacts
│   ├── epic.md               # Epic issue structure
│   ├── story.md              # Story issue structure (with Context/Patterns/Key Types)
│   ├── skill.md              # Skill file structure
│   ├── module.md             # Source module structure
│   ├── test.md               # Test file structure
│   └── rubric.md             # Quality rubric structure
├── rubrics/                  # Quality evaluation criteria
│   ├── code-quality.md       # Architecture, testing, style, error handling
│   ├── test-quality.md       # Coverage, assertions, isolation, clarity
│   └── skill-quality.md      # Clarity, completeness, self-awareness, efficiency
└── patterns/
    └── README.md             # Guide for creating multi-file change recipes
CLAUDE.md                     # Project context (customize this)
```

## Setup

### 1. Fork or clone this template

```bash
gh repo create my-project --template johnnyohwishingtree/claude-pipeline-template --private
cd my-project
```

### 2. Customize `CLAUDE.md`

Replace the skeleton with your project's actual context:
- Tech stack
- Project structure
- Run commands (`pnpm test`, `pnpm typecheck`, etc.)
- Architecture decisions
- Any rules or conventions

### 3. Customize the pipeline skill

Open `.claude/skills/pipeline/SKILL.md` and find-and-replace:
- `OWNER/REPO` → your GitHub org/repo (e.g., `myorg/my-project`)
- Verification commands in Step 4 → your project's build/test commands

### 4. Set up the scheduled task

In Claude Code, create a scheduled task that runs the pipeline:

```
Read CLAUDE.md for project context.
Read .claude/skills/pipeline/SKILL.md and follow every step.
```

Set it to run on whatever interval makes sense (e.g., every 3 hours).

### 5. Seed your first epic

Create your first epic and stories manually (or ask Claude):

```bash
gh label create "epic" --color "0E8A16" 2>/dev/null || true
gh label create "story" --color "1D76DB" 2>/dev/null || true
gh label create "pending" --color "FBCA04" 2>/dev/null || true

gh issue create --title "Epic: <your goal>" --label "epic" \
  --body "## Goal
<what you're building>

## Stories
- [ ] #__ Story 1
- [ ] #__ Story 2

## Success Criteria
- <how you know it's done>"

gh issue create --title "Story: <first task>" --label "story" --label "pending" \
  --body "## Description
<what to implement>

## Acceptance Criteria
- [ ] Implementation complete
- [ ] Tests pass"
```

The next pipeline run will pick up the first pending story automatically.

## Token Optimization

Stories use a structured format that minimizes how much code the pipeline reads:

- **Context** section lists the exact files (and line ranges) needed — no codebase exploration
- **Patterns & Templates** section points to conventions to follow — no reverse-engineering
- **Key Types** section inlines relevant type definitions — no reading entire type files

This reduces token usage by ~4-5x compared to unstructured stories.

## Adding Design Patterns

When you notice a recurring multi-file change (e.g., "add a new API endpoint", "add a new React screen"), create a pattern in `.claude/patterns/`:

```markdown
# Pattern: Add API Endpoint

When adding a new REST endpoint.

## Files to modify (in order)

### 1. `src/routes/<resource>.ts` — Add route handler
### 2. `src/services/<resource>.ts` — Add business logic
### 3. `__tests__/services/<resource>.test.ts` — Add tests

## Checklist
- [ ] Route registered
- [ ] Service function tested
- [ ] Types exported
```

Reference patterns in story bodies so the pipeline follows them automatically.

## Template-Rubric Pairs

Every artifact type has a matching template (structure) and rubric (quality criteria):

| Artifact | Template | Rubric |
|----------|----------|--------|
| Source module | `templates/module.md` | `rubrics/code-quality.md` |
| Test file | `templates/test.md` | `rubrics/test-quality.md` |
| Skill file | `templates/skill.md` | `rubrics/skill-quality.md` |

The pipeline evaluates its own output against rubrics before merging.

## License

MIT
