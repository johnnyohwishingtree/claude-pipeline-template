# Policy: Testable Architecture (Meta-Policy)

## Scope
.knowledge/, __tests__/structure/, src/ (directory structure)

## Rules
- REQUIRE: every testable policy has a structural test in `__tests__/structure/`
- REQUIRE: new policies added to `knowledge-test-coverage.test.ts` mapping
- REQUIRE: code structured so rules are greppable (clear directory boundaries)
- DENY: conventions that can't be tested — restructure until testable

## When Adding a New Policy
Ask: "Can I write a test that catches violations in under 1 second?"
- Yes → write the test, add the policy
- No, but could restructure → restructure first
- No, subjective → it's a design guideline, mark as such

## Exceptions
- Design guidelines (typography, motion) — mark as not structurally testable

## Anti-patterns
- Writing a policy without a structural test
- Convention expressed as prose that can't be grepped for violations

## Enforcement
`__tests__/structure/knowledge-test-coverage.test.ts`
