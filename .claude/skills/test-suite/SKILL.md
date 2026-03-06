---
name: test-suite
description: Find and fix gaps in the test suite
argument-hint: "[target area]"
---

# Test Suite

Audit the test suite for gaps, write missing tests, and fix any bugs the tests reveal.

Target area (optional): $ARGUMENTS

## Steps

1. **Run existing tests** to establish baseline:
   ```
   # TODO: Replace with your test command
   python -m pytest tests/ -v
   ```

2. **Identify gaps** — check for:
   - Source files without corresponding test files
   - Functions/classes without test coverage
   - Edge cases not tested
   - Error handling paths not tested

3. **Write missing tests** following existing test patterns

4. **Fix bugs** found by new tests

5. **Run full suite** to verify everything passes

## Test Structure Convention

Tests should mirror the source structure:
- `src/foo.py` -> `tests/test_foo.py`
- `src/bar/baz.py` -> `tests/bar/test_baz.py`

## Rules

- Tests must not require external services (mock them)
- Tests should skip gracefully if test data is missing
- Run the test suite after every change
