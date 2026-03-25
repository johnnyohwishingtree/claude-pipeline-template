# Testing Conventions

Project-specific testing rules. These supplement the universal test template.

## Framework
<!-- CUSTOMIZE: Replace with your project's test framework -->
- vitest for unit tests
- Playwright for E2E (if applicable)

## Patterns
- Temp directories for filesystem tests: `mkdtempSync` in `beforeEach`, `rmSync` in `afterEach`
- No snapshot files — use inline assertions
- Test names describe behavior: "returns pass when command exits 0"
- Assert specific values: `toBe(100)` not `toBeDefined()`

## Coverage expectations
- Every exported function has tests
- Happy path + at least one error path per function
- Edge cases when applicable (empty input, boundary values)

## Known gaps
<!-- Pipeline adds gaps here when testing patterns are discovered -->
