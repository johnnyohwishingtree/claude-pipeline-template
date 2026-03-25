# Test Template

Test files follow this structure. Customize the test framework and syntax for your stack.

**Matching rubric:** `.knowledge/rubrics/test-quality.md`

## Structure

<!-- CUSTOMIZE: Replace with your language/framework conventions -->
```
// Import test framework
// Import module under test

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Factory for test data — keeps individual tests focused on the scenario.
function makeTestData(overrides) {
  return { field: 'default', ...overrides };
}

// ---------------------------------------------------------------------------
// <functionUnderTest>
// ---------------------------------------------------------------------------
describe('<functionUnderTest>', () => {
  it('<happy path — expected behavior>', () => {
    const result = functionUnderTest(validInput);
    expect(result.field).toBe(expectedValue);
  });

  it('<error path — what happens with bad input>', () => {
    const result = functionUnderTest(invalidInput);
    expect(result.pass).toBe(false);
  });

  it('<edge case — boundary value, empty input>', () => {
    const result = functionUnderTest(edgeCaseInput);
    expect(result).toEqual(expectedEdgeCaseResult);
  });
});
```

## Rules

<!-- CUSTOMIZE: Replace file extension and path conventions -->
- File naming mirrors source: `src/foo` → `tests/foo.test`
- One `describe` per exported function
- Happy path first, then error path, then edge cases
- Use factory functions for repeated test data
- No snapshot files — use inline assertions
- Test names describe behavior, not implementation
- Assert specific values, not just existence

## Anti-patterns
- **Testing implementation** (asserting mock call counts as the only check) — test outputs and behavior
- **Copy-pasting test data inline** — use a factory function
- **One giant test block** — split into focused assertions, one logical check per test
- **No error path tests** — if a function can fail, test that it fails correctly
