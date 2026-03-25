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

## Anti-patterns
- **Renaming a file without grepping for references** — old paths in `.md`, `.yaml`, and import statements silently break
- **Updating a CLI command without updating README** — users copy-paste stale commands
- **Changing exports without checking consumers** — dead imports cause runtime errors, not compile errors
- **Trusting CI will catch drift** — most drift is in docs and config, which CI doesn't check
