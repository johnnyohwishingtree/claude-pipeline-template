# System Index

Read this first. Maps every artifact in the pipeline system.

## .claude/ (read-only — human edits only)

| File | Purpose |
|------|---------|
| `skills/pipeline/SKILL.md` | Autonomous story loop (hourly scheduled task) |
| `skills/audit/SKILL.md` | Drift detection (3x daily scheduled task) |
| `skills/optimize/SKILL.md` | Resolve gaps + compress knowledge graph |
| `rules/` | Always-on constraints (auto-loaded) |
| `settings.json` | Permissions |

## .knowledge/ (read-write — pipeline edits freely)

| Directory | What it contains | When to read |
|-----------|-----------------|-------------|
| `templates/` | File structure definitions (module, test, story, epic) | When creating files |
| `patterns/` | Multi-file change recipes | When implementing a multi-step task |
| `concepts/` | Cross-cutting principles (drift detection, error handling) | When the story's Knowledge section references them |
| `conventions/` | Project-specific rules (testing, styling) | When writing code that follows project conventions |
| `domain/` | Business logic knowledge | When implementing domain-specific features |
| `rubrics/` | Quality evaluation criteria | During self-review |

All `.knowledge/` files can have `## Known gaps` sections. The pipeline adds gaps during Step 5 (learn). The /optimize skill resolves them.

## Folder-level CLAUDE.md files (created by pipeline)

Short pointer files (max 5 lines) placed in source directories when directory-specific conventions are discovered. Auto-loaded by Claude Code when working in that directory.

Template: `.knowledge/templates/folder-claude-md.md`

These point to `.knowledge/` files — they don't contain the knowledge themselves.
