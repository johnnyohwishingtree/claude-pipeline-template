---
name: plan-feature
description: Plan and implement a new feature
argument-hint: "[feature description]"
---

# Plan Feature

Plan and implement a new feature for this project.

## Steps

1. **Read CLAUDE.md** for project context and conventions
2. **Explore the codebase** to understand existing patterns
3. **Plan the implementation** — identify files to create/modify
4. **Implement** — write the code following existing patterns
5. **Test** — write tests and verify they pass
6. **Commit** — stage specific files, commit with descriptive message, push

## Implementation Guidelines

- Follow existing code patterns and conventions
- Add tests for new functionality
- Handle error cases explicitly
- Keep changes focused — don't refactor unrelated code
- Commit and push frequently (every 2-3 file changes)

## After Implementation

- Run the full test suite to verify nothing is broken
- Create a PR with `Closes #N` if working from an issue
