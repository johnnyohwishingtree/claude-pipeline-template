# Testable Architecture

Structure code so conventions are mechanically verifiable. If you can't write a test for a rule, restructure until you can.

## Principle

A convention that can't be tested is a suggestion. It will be violated, nobody will notice, and the knowledge graph becomes fiction. The architecture must make rules enforceable by simple structural tests (grep, parse, file scan) that run in under 1 second.

## What makes conventions testable

### Clear directory boundaries
Separate code by responsibility into distinct directories. Import boundary rules become greppable:
- "Layer X never imports from Layer Y" → grep directory X for imports from Y

### Predictable naming patterns
Files and exports follow consistent conventions. Structural tests can scan and validate:
- "All files in directory X follow pattern Y" → list files, check names

### Declarative metadata
Configuration and schemas live in parseable formats (JSON, typed objects). Validation becomes parsing:
- "All fields in schema have property X" → parse JSON, check each field

### Centralized boundaries
Storage, security, and API boundaries go through single abstractions. Tests can verify the abstraction is used:
- "Sensitive data only stored via service X" → grep for direct access that bypasses X

## Red flags — conventions that can't be tested

| Red flag | Root cause | Fix |
|---|---|---|
| "Don't have too much logic in X" | No measurable threshold | Define a numeric limit |
| "Use good naming" | Too vague | Define a naming pattern |
| "Keep files small" | No enforcement | Define a line limit + check |
| "Don't mix concerns" | No directory boundaries | Separate into directories |
| "Follow the style guide" | Guide isn't parseable | Use anti-patterns list that can be grepped |

## When adding a new convention

Ask: "Can I write a test in `__tests__/structure/` that catches violations in under 1 second?"

- **Yes** → write the test, add the convention
- **No, but I could restructure** → restructure first, then add
- **No, it's subjective** → it's a guideline, not a convention. Document it but don't pretend it's enforced.
