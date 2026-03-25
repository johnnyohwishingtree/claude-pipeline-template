# Testing Conventions

Project-specific testing rules. These supplement the universal test template.

## Framework
<!-- CUSTOMIZE: Replace with your project's test framework -->
- vitest for unit tests
- Playwright for E2E (if applicable)

## Rules
- **Zero known failures** — never merge code with a failing test. Fix or delete the test before merging. A "known failure" that ships becomes every future pipeline run's problem.
- **If you wrote it, it must pass** — run the specific test file you created before committing. If it crashes or fails, that's your bug to fix, not an "environment issue."
- Every exported function has tests
- Happy path + at least one error path per function
- Edge cases when applicable (empty input, boundary values)

## Patterns
- Test names describe behavior: "returns pass when command exits 0"
- Assert specific values: `toBe(100)` not `toBeDefined()`
- No snapshot files — use inline assertions
<!-- CUSTOMIZE: Add project-specific patterns (temp dirs, fixtures, etc.) -->

## Anti-patterns
- **Testing implementation details** — test behavior and outputs, not internal method calls
- **Tests that depend on execution order** — each test must be independently runnable
- **Mocking everything** — only mock what you must (filesystem, network); test real logic
- **Weak assertions** (`toBeDefined()`, `not.toBeNull()`) — assert specific values
- **Re-running CI to verify a fix** — write a unit test first, get instant feedback
- **Spawning background test processes to retry** — if a test fails consistently, fix the root cause
