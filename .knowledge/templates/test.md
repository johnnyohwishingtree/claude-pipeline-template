# Test Template

Test files follow this structure. Customize the test framework imports for your stack (vitest, jest, etc.).

**Matching rubric:** `.knowledge/rubrics/test-quality.md`

## Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // or jest
import { functionUnderTest } from '../src/<module>';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Factory for test data — keeps individual tests focused on the scenario. */
function makeTestData(overrides?: Partial<RelevantType>): RelevantType {
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

- File naming mirrors source: `src/foo.ts` → `__tests__/foo.test.ts`
- One `describe` per exported function
- Happy path first, then error path, then edge cases
- Use factory functions for repeated test data
- Temp directories for filesystem tests (create in `beforeEach`, remove in `afterEach`)
- No snapshot files — use inline assertions
- Test names describe behavior, not implementation
- Assert specific values, not just existence

## Anti-patterns
- **Testing implementation** (`expect(mock).toHaveBeenCalledTimes(3)` as the only assertion) — test outputs and behavior
- **Copy-pasting test data inline** — use a factory function (`makeTestData()`)
- **One giant `it()` block** — split into focused assertions, one logical check per `it()`
- **No error path tests** — if a function can fail, test that it fails correctly
