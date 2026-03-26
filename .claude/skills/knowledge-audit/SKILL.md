---
name: knowledge-audit
description: Audit code against .knowledge/ conventions — find violations, evaluate fixes, propose test strategies
argument-hint: "[--dry-run] [layer]"
---

# /knowledge-audit — Code vs Knowledge Compliance Audit

Checks whether code in each folder actually follows the rules declared in its CLAUDE.md and linked `.knowledge/` files. For each violation, evaluates whether to fix the code or update the knowledge, and proposes a test strategy to prevent regression.

Differs from `/audit` (which checks drift, dead code, and index sync). This skill focuses specifically on whether the code conforms to the documented conventions.

## Step 1: For each folder CLAUDE.md, read the rules

For each folder with a CLAUDE.md:
1. Read the CLAUDE.md
2. Read all linked `.knowledge/` files (the `See:` references)
3. Extract the concrete rules (both "do this" and "anti-patterns")

## Step 2: Check code against rules

For each rule, run the appropriate check. Common patterns:

- **Import boundary rules** ("never import X") → grep source files for the forbidden import pattern
- **Naming conventions** ("files follow X pattern") → list files and check names
- **Barrel export completeness** ("all exported from index") → compare directory contents to barrel
- **Code complexity thresholds** ("extract when > N") → count occurrences per file
- **Security boundaries** ("sensitive data stays in X") → trace data flow from source to storage

For each policy, read its SCOPE and RULES sections to determine what to check and where.

## Step 3: Check knowledge test coverage

For each `.knowledge/policies/` file, read its ENFORCEMENT section and verify the referenced test exists. The `knowledge-test-coverage.test.ts` meta-test tracks the full mapping.

For any policy **without** an ENFORCEMENT test:
1. Is it structurally testable? → write the test
2. Is it a design guideline? → skip, note it
3. Add new policies to `knowledge-test-coverage.test.ts` mapping

**New knowledge files added since last audit** should be flagged if not mapped.

## Step 4: Evaluate each finding

For every violation, decide:

**Code is wrong** → the convention is correct, code needs fixing
**Knowledge is stale** → the code is intentionally different, update the knowledge

## Step 5: Propose test strategy for each code fix

Every fix needs a test to prevent regression. For each violation, specify:

- What type of test (structural grep, unit test, schema validation, etc.)
- Where to add it (`__tests__/structure/`, existing test file, new test file)
- What it should assert

If no existing test covers the violation, create one. The test should run at verification time (< 1 second) so it catches drift immediately.

## Step 6: Check knowledge consistency

Scan for contradictions between knowledge files. Two files should never give opposite instructions about the same topic.

### How to check:

**1. Extract rules by topic.** For each knowledge file, list the concrete rules as topic + instruction pairs.

**2. Cluster by shared topics.** Find files that mention the same concepts. These are the files that could contradict.

**3. Compare instructions.** For each shared topic:
- **Consistent**: both agree, or one is a scoped exception of the other
- **Contradictory**: one says "always do X" and another says "never do X" with no scoping

### Common conflict patterns:
- Anti-pattern in file A is a recommendation in file B (without scoping)
- Two files define different rules for the same pattern
- A folder CLAUDE.md links to two knowledge files that disagree
- A convention was updated but files that reference it still describe the old rule

### When a conflict is found:
- Determine which file is authoritative (usually the more specific one)
- Update the other file to reference the authoritative rule or add explicit scoping
- Add to gaps.md under `## Knowledge updates`

## Step 7: Write all findings to gaps.md

Write findings to `.knowledge/gaps.md` with the test strategy included:

```markdown
## Code fixes
- `src/path/to/file` — <violation description>. Test: <how to prevent recurrence>. (knowledge-audit-YYYY-MM-DD)
```

## Step 8: Fix or create stories (if not --dry-run)

- **Quick fixes** (< 5 minutes): fix inline and commit
- **Larger fixes**: create a story with the test strategy in the acceptance criteria

## What NOT to flag
- Violations already listed in `gaps.md` (don't duplicate)
- Design guidelines that can't be structurally tested (note them, don't flag)
- Empty `.knowledge/` directories
