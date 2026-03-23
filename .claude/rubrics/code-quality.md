# Code Quality Rubric

Evaluate source modules (following `.claude/templates/module.md`) against these criteria.

## Architecture (weight: 35%)
- Functions are small and single-purpose
- Dependencies flow in one direction (no circular imports)
- Types are precise (no `any`, no loose unions)
- Errors are handled explicitly, not swallowed
- No side effects at module level

## Testing (weight: 30%)
- New functions have corresponding tests
- Tests cover the happy path AND at least one error path
- Mocks are minimal — prefer testing real logic
- No snapshot files (use inline assertions)

## Code Style (weight: 20%)
- TypeScript strict mode passes
- No unused imports or variables
- Consistent naming: camelCase for functions, PascalCase for types
- Comments explain WHY, not WHAT

## Error Handling (weight: 15%)
- Functions that can fail throw descriptive errors or return result types
- External input is validated at boundaries
- No silent catch blocks that swallow errors
