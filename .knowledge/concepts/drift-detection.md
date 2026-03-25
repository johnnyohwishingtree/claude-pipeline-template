# Drift Detection

When source code changes, derived artifacts must stay in sync. Drift happens when one side changes without updating the other.

## Applies to
- README.md ↔ CLI help output (commands listed must match)
- index.md references ↔ actual files on disk
- Test IDs in source ↔ E2E test flows that reference them
- Schema field names ↔ form rendering code
- Config definitions ↔ config loader/validator

## How to check
- After renaming/moving files: grep for old paths in all .md and .yaml files
- After changing CLI commands: verify README matches `help` output
- After changing exports: verify all exports are imported somewhere

## How to prevent
- Story acceptance criteria should include: "all references updated"
- /audit skill checks for common drift patterns
