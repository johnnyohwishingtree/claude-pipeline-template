# Rules

Rules are always-on constraints. Claude Code auto-loads every `.md` file in this directory into every session — you don't need to reference them explicitly.

## How rules fit in the `.claude/` system

```
rules/       → "always do X / never do Y" — loaded automatically, every session
templates/   → "a single file should look like this" — read on demand when creating files
patterns/    → "a multi-file change goes in this order" — read on demand during implementation
rubrics/     → "evaluate quality against these criteria" — read on demand during review
```

**Rules** constrain behavior. **Templates** define structure. **Patterns** define process. **Rubrics** define quality.

They work together:
- A rule says "every bug fix must have a failing test first" (always-on constraint)
- A pattern says "when adding a screen: create folder, create file, add route, add test" (step-by-step recipe)
- A template says "a test file has describe blocks, factories, and happy/error paths" (file structure)
- A rubric says "test coverage is 35% of the quality score" (evaluation criteria)

## When to create a rule

Create a rule when:
- A mistake keeps happening and you want to prevent it permanently
- A practice should apply to ALL work, not just specific change types
- The constraint is short enough to state in a few sentences

If the guidance is a multi-step recipe for a specific type of change, it's a **pattern**, not a rule.
If the guidance describes what a file should look like, it's a **template**, not a rule.

## Rule structure

Keep rules short and direct. A rule file should be:
- 5-30 lines (if it's longer, it's probably a pattern)
- Imperative ("Do X", "Never Y", "Always Z")
- Observable (someone can check whether the rule was followed)

## Starter rules included

- `tdd.md` — Write a failing test before fixing bugs
- `commit-gate.md` — Run checks before every commit
- `file-conventions.md` — Project structure and naming conventions
