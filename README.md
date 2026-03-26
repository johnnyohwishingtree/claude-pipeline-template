# Claude Pipeline Template

A self-improving autonomous development pipeline powered by Claude Code scheduled tasks. No CI runners, no CLI tools — just markdown files that Claude reads, follows, and improves.

## How It Works

Two scheduled tasks run on claude.ai:

**Hourly — `/pipeline`:** picks up pending stories, implements them, verifies, merges, and plans new work when the queue is empty. After each story, it reflects on what the templates were missing and updates them.

**3x daily — `/audit`:** scans the codebase for drift, dead code, and violations. Adds findings as gaps to the knowledge graph and creates fix stories.

The entire loop — planning, coding, testing, learning, improving — runs autonomously.

## The Knowledge Graph

The pipeline doesn't just write code — it builds a knowledge graph about your project that makes future code better:

```
.knowledge/
├── policies/        # Constraints by scope (SCOPE/RULES/ENFORCEMENT)
├── models/          # Business entities (ENTITIES/RELATIONSHIPS/INVARIANTS)
├── templates/       # File structure definitions (how to write a module, test, etc.)
├── patterns/        # Multi-file recipes (how to add a screen, API endpoint, etc.)
└── rubrics/         # Quality criteria (what "good" means)
```

Every file can have a `## Known gaps` section. When the pipeline implements a story and discovers something the template didn't cover, it adds a gap entry. The `/optimize` skill resolves gaps by adding the missing guidance.

Over time, the templates get more complete → the pipeline follows better instructions → fewer gaps → better code.

## Setup

### 1. Create your repo from this template

```bash
gh repo create my-project --template johnnyohwishingtree/claude-pipeline-template --private
cd my-project
```

### 2. Customize

- **`CLAUDE.md`** — replace with your project's context, tech stack, run commands
- **`.claude/skills/pipeline/SKILL.md`** — find-and-replace `OWNER/REPO` with your org/repo, update verify commands
- **`.knowledge/policies/`** — add your project's testing, styling, and other conventions
- **`.knowledge/models/`** — add business logic knowledge specific to your project

### 3. Set up scheduled tasks on claude.ai

**Pipeline (hourly):**
```
Read CLAUDE.md for project context.
Read .claude/skills/pipeline/SKILL.md and follow every step.
```

**Audit (3x daily):**
```
Read CLAUDE.md for project context.
Read .claude/skills/audit/SKILL.md and follow every step.
```

### 4. Create labels and seed work

```bash
gh label create "epic" --color "0E8A16"
gh label create "story" --color "1D76DB"
gh label create "pending" --color "FBCA04"
gh label create "in-progress" --color "0E8A16"
gh label create "completed" --color "0075CA"

gh issue create --title "Story: <your first task>" --label "story,pending" \
  --body "<follow .knowledge/templates/story.md>"
```

The next pipeline run picks it up.

## Directory Structure

```
.claude/ (read-only — human edits only)
├── skills/
│   ├── pipeline/SKILL.md     # The autonomous loop
│   ├── audit/SKILL.md        # Drift detection
│   └── optimize/SKILL.md     # Resolve gaps, compress knowledge
├── rules/                     # Always-on constraints (auto-loaded)
└── index.md                   # System manifest

.knowledge/ (read-write — pipeline edits freely)
├── policies/                  # Constraints by scope (SCOPE/RULES/ENFORCEMENT)
├── models/                    # Business entities (ENTITIES/RELATIONSHIPS/INVARIANTS)
├── templates/                 # File structure definitions
├── patterns/                  # Multi-file change recipes
└── rubrics/                   # Quality evaluation criteria
```

**`.claude/` is read-only.** Skills and rules need human approval to change. This prevents the pipeline from weakening its own constraints.

**`.knowledge/` is read-write.** Policies, models, and templates evolve as the pipeline learns. Gaps get added during implementation, resolved by `/optimize`. See `ENGINE-TYPES.md` for the five knowledge engine types.

## The Self-Improvement Loop

```
Story implemented
  → Pipeline reflects: "template didn't cover X, found guidance in Y"
  → Gap added to template: "- X — found in Y (#story)"
  → /optimize resolves gap: adds X to template, removes gap entry
  → Next story using that template: X is covered, no gap needed
  → Template converges
```

This is the autoresearch pattern applied to code quality — try, measure, learn, improve. But instead of optimizing model weights, you're optimizing the instructions that guide the AI agent.

## License

MIT
