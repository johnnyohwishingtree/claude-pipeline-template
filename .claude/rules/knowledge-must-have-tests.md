# Knowledge Must Have Tests

When you create or modify a `.knowledge/policies/` file that contains structurally testable rules (ALLOW/DENY/REQUIRE), you MUST also create or update a corresponding structural test in `__tests__/structure/`.

A policy without a test is a suggestion, not a rule. It WILL be violated and nobody will notice.

## What counts as structurally testable:
- "DENY: import X" → grep for the forbidden import pattern
- "REQUIRE: files follow X naming" → list files and check names
- "REQUIRE: all exported from barrel" → compare directory to exports
- "REQUIRE: fields have X property" → parse and validate

## What is NOT structurally testable:
- Design guidelines (typography, motion, ux-writing)
- Subjective quality criteria
- Process conventions

## When this applies:
- Creating a new `.knowledge/policies/**/*.md` file
- Adding a new RULE to an existing policy file
- The `/knowledge-audit` skill flags missing tests in Step 3
