# Policy: Test Conventions

<!-- CUSTOMIZE: Replace with your project's test framework and rules -->

## Scope
__tests__/

## Rules
- REQUIRE: zero known failures — never merge with a failing test
- REQUIRE: if you wrote a test, run it individually before committing
- REQUIRE: every exported function has tests (happy path + error path)
- DENY: tests that depend on execution order
- DENY: weak assertions (`toBeDefined()`) — assert specific values

## Exceptions
- E2E tests may take longer than 1 second
- Generated test data factories don't need their own tests

## Anti-patterns
- Merging with a known failing test
- Re-running CI to check if a fix worked instead of writing a unit test
- Mocked dependency tests as proof the feature works (verify at runtime too)

## Enforcement
<!-- CUSTOMIZE: Reference your commit gate rule -->
`.claude/rules/commit-gate.md`
