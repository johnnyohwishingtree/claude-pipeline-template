# Policy: Drift Detection

## Scope
src/, __tests__/, .knowledge/

## Rules
<!-- CUSTOMIZE: Add your project's drift-prone artifacts -->
- REQUIRE: after renaming/moving files → grep for old paths in all .md files
- REQUIRE: after changing exports → verify all consumers updated
- DENY: references to files that don't exist in docs or config

## What Drifts
| Source | Derived artifact |
|---|---|
| File renames | References in .md files |
| Config changes | README documentation |
| Export changes | Import statements |

## Exceptions
- Empty directories don't count as drift

## Anti-patterns
- Renaming a file without grepping for references
- Updating a command without updating README
- Trusting CI will catch drift (most drift is in docs, not code)

## Enforcement
<!-- CUSTOMIZE: Add your drift detection test -->
`/audit` skill checks for broken references
