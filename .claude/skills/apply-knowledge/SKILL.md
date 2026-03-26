---
name: apply-knowledge
description: Scan codebase and fix violations against a specific .knowledge/ file
argument-hint: "<knowledge-file> [--dry-run] [--scope path/]"
---

# /apply-knowledge — Scan and Fix Against a Knowledge File

Takes a single `.knowledge/` file, scans the relevant codebase for violations, and fixes them. Unlike `/knowledge-audit` (which audits ALL knowledge but only reports), this skill focuses on ONE knowledge file and actively implements fixes.

## Usage
```
/apply-knowledge policies/testing/test-conventions.md           # Fix testing violations
/apply-knowledge policies/architecture/dependency-direction.md  # Fix import boundaries
/apply-knowledge policies/ui/styling.md --dry-run   # Report only
/apply-knowledge domain/form-engine.md --scope src/schemas  # Scoped
```

## Step 1: Load the knowledge file

Read the specified `.knowledge/` file. Extract:

If it's a **policy** (`policies/`), read its SCOPE, RULES, and EXCEPTIONS sections.
If it's a **model** (`models/`), read its INVARIANTS and KEY FILES sections.

## Step 2: Determine what to scan

For policies: the **SCOPE** section lists the exact directories.
For models: the **KEY FILES** section lists the files to check.

Infer scope from the knowledge file content, or use `--scope` override. Read the file's rules to determine which source directories they apply to.

## Step 3: Scan for violations

For each rule and anti-pattern, scan the scope:
- **Grep-based rules** ("never import X") → grep and collect violations
- **Structural rules** ("files must follow pattern X") → list and check
- **Content rules** ("use type Y for Z") → parse and validate

Collect violations with file path, line number, and specific rule violated.

## Step 4: Fix violations (if not --dry-run)

Apply fixes one file at a time:
- Run typecheck after each file
- If a fix requires judgment (not mechanical), skip and add to gaps.md

## Step 5: Cascade — check files that reference this knowledge

After updating a policy or model, check for cascade effects:
1. Find all folder CLAUDE.md files that `See:` this file
2. Find all other knowledge files that reference this file
3. Verify they're still consistent with the updated content
4. If a referenced fact changed, update all referencing files

This prevents denormalization drift — one source of truth, all references stay in sync.

## Step 6: Write tests for fixes

Every fix must have a test that prevents recurrence. Check if a structural test already covers it — if not, create one.

## Step 7: Verify

Run the project's verification commands.

## Step 8: Report

- Files scanned
- Violations found (by rule)
- Violations fixed
- Violations skipped (added to gaps.md)
- Tests created/updated
