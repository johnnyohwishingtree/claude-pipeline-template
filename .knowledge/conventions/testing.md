# Testing Conventions

Project-specific testing rules. These supplement the universal test template.

## Framework
<!-- CUSTOMIZE: Replace with your project's test framework -->
- vitest for unit tests
- Playwright for E2E (if applicable)

## Rules
- **Zero known failures** — never merge code with a failing or OOMing test. Fix or delete the test before merging. A "known failure" that ships becomes every future pipeline run's problem.
- **If you wrote it, it must pass** — run the specific test file you created before committing. If it crashes, OOMs, or fails, that's your bug to fix, not an "environment issue."
- Every exported function has tests
- Happy path + at least one error path per function
- Edge cases when applicable (empty input, boundary values)

## Patterns
- Temp directories for filesystem tests: `mkdtempSync` in `beforeEach`, `rmSync` in `afterEach`
- No snapshot files — use inline assertions
- Test names describe behavior: "returns pass when command exits 0"
- Assert specific values: `toBe(100)` not `toBeDefined()`

## Test memory management
Heavy import chains cause OOM in test runners.

- **Import directly, not from barrels** — `from './myModule'` not `from './index'`. Barrel imports pull in every module's dependency tree.
- **Mock heavy dependencies at module level** — if a module imports 3 stores/services, mock them. This prevents the test runner from compiling the entire dependency chain.
- **Store/service mocks must return stable references** — if a mock returns `{ data: { ... } }` inline, each call gets a new object, triggering `useEffect`/`useCallback` deps → infinite loop → OOM. Declare mock data as module-level constants.

## Anti-patterns
- **`toMatchSnapshot()`** — creates `.snap` files that fail in CI; use `toMatchInlineSnapshot()` or explicit assertions
- **Testing implementation details** — test behavior and outputs, not internal method calls
- **Tests that depend on execution order** — each test must be independently runnable
- **Mocking everything** — only mock what you must (filesystem, network); test real logic
- **Asserting `toBeDefined()`** — assert specific values (`toBe(100)`, `toContain('error')`)
- **Slow unit tests** — keep under 1 second; slow tests belong in E2E
- **Re-running CI to verify a fix** — write a unit test first, get instant feedback
- **Importing from barrel in tests** — pulls in every module's dependency tree, causes OOM
- **Spawning background test processes to retry** — if a test OOMs, fix the import chain or mocks, don't throw more resources at it
