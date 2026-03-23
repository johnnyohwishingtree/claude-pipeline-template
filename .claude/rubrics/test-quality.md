# Test Quality Rubric

Evaluate test files (following `.claude/templates/test.md`) against these criteria.

## Coverage (weight: 35%)
- Every exported function has a corresponding `describe` block
- Happy path is tested (valid input → expected output)
- At least one error path is tested per function
- Edge cases tested where applicable (empty input, boundary values)

## Assertions (weight: 25%)
- Assertions check specific values, not just existence (`toBe(100)` not `toBeDefined()`)
- Error messages are asserted (`toContain('message')` not just `pass === false`)
- Return type shape is verified (all relevant fields checked)

## Isolation (weight: 20%)
- Tests use temp directories for filesystem operations
- Tests do not depend on execution order
- Mocks are minimal — real logic tested where possible
- Environment mutations restored in `afterEach`

## Clarity (weight: 20%)
- Test names describe behavior, not implementation
- Factory functions abstract repeated test data
- One logical assertion group per `it()` block
