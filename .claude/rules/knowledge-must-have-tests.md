# Knowledge Must Have Tests

When you create or modify a `.knowledge/conventions/` file that contains structurally testable rules (import boundaries, naming patterns, required props, field types), you MUST also create or update a corresponding structural test in `__tests__/structure/`.

A convention without a test is a suggestion, not a rule. It WILL be violated and nobody will notice.

## What counts as structurally testable:
- "Never import X" → grep for the forbidden import pattern
- "Files must follow X naming" → list files and check names
- "All exported from barrel" → compare directory to exports
- "Fields must have X property" → parse and validate

## What is NOT structurally testable:
- Design guidelines (typography, spacing, color choices)
- Subjective quality criteria ("code should be readable")
- Process conventions ("write tests before fixing bugs")

## When this applies:
- Creating a new `.knowledge/conventions/*.md` file
- Adding a new rule to an existing convention file
- The `/knowledge-audit` skill flags missing tests in Step 3
