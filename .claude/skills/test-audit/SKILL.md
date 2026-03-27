---
name: test-audit
description: Score existing tests for quality, find junk tests, recommend deletions and rewrites
argument-hint: "[--scope path/] [--dry-run] [--tier 3-4]"
---

# /test-audit — Test Quality Audit

Scores existing tests against `.knowledge/policies/testing/test-quality.md`, identifies low-value and negative-value tests, and either fixes or deletes them. Unlike `/test-suite` (which adds missing tests), this skill evaluates whether existing tests are worth keeping.

## Usage
```
/test-audit                          # Audit all tests
/test-audit --scope hooks            # Only audit hook tests
/test-audit --tier 3-4               # Only find Tier 3-4 (low/negative value)
/test-audit --dry-run                # Report only, don't change anything
```

## Step 1: Scan test files

Collect all test files matching the scope. For each test file, extract:
- Number of `it()` / `test()` blocks
- Number of assertions per block
- Types of assertions used (toBe, toBeDefined, toHaveBeenCalled, etc.)
- Number of `jest.mock()` calls vs real imports
- Whether the test has edge cases or only happy path
- Whether the test name describes behavior or implementation

## Step 2: Score each test file

Apply the quality tiers from `.knowledge/policies/testing/test-quality.md`:

### Tier 4 checks (delete candidates)
- `it()` blocks with zero assertions
- Tests that mock the function under test
- Tests where assertions are so loose they pass with any implementation
- Tests that only assert `toBeDefined()` or `toBeTruthy()` on return values

### Tier 3 checks (rewrite candidates)
- "It renders" / "it renders without crashing" as the ONLY test for a component
- Tests where `jest.mock()` count > real import count
- Tests that duplicate coverage (same code path, same inputs, different test names)
- Tests that assert `toHaveBeenCalled()` without checking arguments
- Tests with hardcoded implementation details (exact render count, internal state shape)

### Tier 2 checks (improve candidates)
- Tests missing error/edge case coverage (only happy path)
- Tests with weak assertions that could be stronger

### Tier 1 checks (keep as-is)
- Tests with real business logic assertions
- Bug regression tests
- Integration tests verifying module boundaries
- Tests with edge case coverage

## Step 3: Report findings

Summary table:
| Tier | Count | Action |
|------|-------|--------|
| Tier 1 (high value) | N | Keep |
| Tier 2 (medium) | N | Improve assertions |
| Tier 3 (low value) | N | Rewrite or delete |
| Tier 4 (negative) | N | Delete |

## Step 4: Fix (if not --dry-run)

- **Tier 4**: Delete the test file, run `pnpm test` to confirm
- **Tier 3**: Rewrite to test behavior, add edge cases, remove unnecessary mocks
- **Tier 2**: Add missing error paths, strengthen assertions

## Step 5: Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Test count may go DOWN — that's expected if quality went up.

## Step 6: Update knowledge

Add new anti-patterns discovered during the audit to the testing policies.

## What NOT to delete
- Bug regression tests (even if simple)
- Structural tests in `__tests__/structure/`
- Tests for security-critical code
- Tests the user explicitly asked for
