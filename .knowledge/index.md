# System Index

Read this first. Maps every artifact in the system. See `ENGINE-TYPES.md` for format reference.

## .claude/ (read-only — human edits only)

| File | Purpose |
|------|---------|
| `skills/pipeline/SKILL.md` | Autonomous story loop (hourly) |
| `skills/local-pipeline/SKILL.md` | Same, for local CLI / Claude Desktop |
| `skills/audit/SKILL.md` | Drift detection, dead code, index sync |
| `skills/knowledge-audit/SKILL.md` | Policy compliance + test coverage + consistency |
| `skills/apply-knowledge/SKILL.md` | Scan and fix against one knowledge file |
| `skills/optimize/SKILL.md` | Resolve gaps + compress knowledge |
| `rules/` | Always-on constraints (auto-loaded) |
| `settings.json` | Permissions |

## .knowledge/ — Five Engine Types

| Engine | Directory | Format | Purpose |
|--------|-----------|--------|---------|
| **Policy** | `policies/` | SCOPE, RULES (ALLOW/DENY/REQUIRE), ENFORCEMENT | Enforce constraints |
| **Model** | `models/` | ENTITIES, RELATIONSHIPS, INVARIANTS | Business context |
| **Template** | `templates/` | STRUCTURE, RULES, MATCHING RUBRIC | File generation |
| **Pattern** | `patterns/` | STEPS, FILES, CHECKLIST | Multi-step recipes |
| **Rubric** | `rubrics/` | CRITERIA (weighted), ANTI-PATTERNS | Quality evaluation |

Gaps → `.knowledge/gaps.md`. Folder CLAUDE.md files auto-load relevant policies/models per directory.
