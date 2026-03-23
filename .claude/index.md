# .claude/ System Index

Read this file first. It maps every artifact in the pipeline system. Only read individual files when you need their full content.

## Rules (auto-loaded every session)

| File | Constraint |
|------|-----------|
| `rules/tdd.md` | Write a failing test before fixing any bug |
| `rules/commit-gate.md` | Run typecheck + tests before every commit |
| `rules/file-conventions.md` | Project structure, `.claude/` layout, naming conventions |
| `rules/update-index.md` | Update this index when `.claude/` files change |

## Templates + Rubric Pairs

| Template | Rubric | What it structures |
|----------|--------|--------------------|
| `templates/module.md` | `rubrics/code-quality.md` | Source modules |
| `templates/test.md` | `rubrics/test-quality.md` | Test files |
| `templates/skill.md` | `rubrics/skill-quality.md` | Skill definitions |
| `templates/epic.md` | — | Epic issues |
| `templates/story.md` | — | Story issues |
| `templates/rubric.md` | Self | Rubric files |

## Patterns

| Pattern | Trigger | Templates Used |
|---------|---------|----------------|
| *(create project-specific patterns as recurring changes emerge)* | | |

See `patterns/README.md` for how to create patterns and how rules/templates/patterns/rubrics connect.

## Skills

| Skill | Purpose | Invocation |
|-------|---------|------------|
| `skills/pipeline/SKILL.md` | Autonomous story loop — merge, implement, verify, push, plan | `/pipeline` |

## Dependency Graph

```
Story body references → Patterns → Templates
                                        ↓
Rules (always on)              Rubrics evaluate output
```

Stories list which patterns and templates to follow. Patterns reference templates for individual file structure. Rubrics evaluate the result. Rules apply to everything.

<!-- pipeline:index-version:1 -->
