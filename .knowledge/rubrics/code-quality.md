# Code Quality Rubric

Evaluate source modules (following `.knowledge/templates/module.md`) against these criteria.

## Architecture (weight: 35%)
- Functions are small and single-purpose
- Dependencies flow in one direction (no circular imports)
- Types are precise — avoid untyped or loosely-typed parameters
- Errors are handled explicitly, not swallowed
- No side effects at module level

## Testing (weight: 30%)
- New functions have corresponding tests
- Tests cover the happy path AND at least one error path
- Mocks are minimal — prefer testing real logic
- No snapshot files (use inline assertions)

## Code Style (weight: 20%)
<!-- CUSTOMIZE: Replace with your language's conventions -->
- Type checker / linter passes with zero errors
- No unused imports or variables
- Consistent naming conventions
- Comments explain WHY, not WHAT

## Error Handling (weight: 15%)
- Functions that can fail throw descriptive errors or return result types
- External input is validated at boundaries
- No silent catch blocks that swallow errors

## Anti-patterns
- **Untyped parameters** — find the real type, don't bypass the type system
- **Circular imports** (A imports B imports A) — always a dependency direction violation
- **Side effects at module level** (top-level network calls, file writes) — wrap in functions
- **500+ line files** — split into focused modules
- **Unused exports** — dead code that misleads readers; delete it
- **Logging for error handling** — throw or return a result type instead
