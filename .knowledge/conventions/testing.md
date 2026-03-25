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

## Anti-patterns
- **`toMatchSnapshot()`** — creates `.snap` files that fail in CI; use `toMatchInlineSnapshot()` or explicit assertions
- **Testing implementation details** — test behavior and outputs, not internal method calls
- **Tests that depend on execution order** — each test must be independently runnable
- **Mocking everything** — only mock what you must (filesystem, network); test real logic
- **Asserting `toBeDefined()`** — assert specific values (`toBe(100)`, `toContain('error')`)
- **Slow unit tests** — keep under 1 second; slow tests belong in E2E
- **Re-running CI to verify a fix** — write a unit test first, get instant feedback
