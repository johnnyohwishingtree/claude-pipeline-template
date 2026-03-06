# CLAUDE.md — Project Instructions

<!--
  CUSTOMIZE THIS FILE for your project.
  This is the primary context file that Claude reads before every task.
  Keep it concise and accurate — Claude uses this to understand your codebase.
-->

## Quick Orientation

<!-- Describe what this project does in 2-3 sentences -->
TODO: Describe your project here.

## Project Structure

<!-- List key files and directories -->
```
src/                # Source code
tests/              # Test suite
docs/               # Documentation
```

## Run Commands

```bash
# Run tests
# TODO: Replace with your test command
python -m pytest tests/ -v

# Run the app
# TODO: Replace with your run command
python app.py
```

## Architecture

<!-- Link to architecture diagrams if you have them -->
<!-- See docs/architecture/ for Mermaid diagrams -->

## Key Concepts

<!-- Domain-specific concepts that Claude needs to understand -->
TODO: Add domain concepts here.

## Skills Reference

Available skills (invoke with `/<skill-name>`):
- `/epic-planner` — Break a goal into Epic + Story GitHub Issues
- `/plan-feature` — Plan and implement a new feature
- `/test-suite` — Find and fix test coverage gaps
- `/organize` — Reorganize file structure
- `/cleanup` — Remove unused files
- `/update-architecture` — Update architecture diagrams
- `/refactor-design` — Audit and fix architecture issues
- `/qa` — Walk through the app and document bugs

## Autonomous Workflow

When working from a GitHub issue (via the Claude GitHub App):
1. Read this file first for project context
2. Follow the skill referenced in the issue body
3. Create a PR with `Closes #N` in the body (N = issue number)
4. Ensure all tests pass before pushing
5. Run `/update-architecture` if code structure changed

### Git Commit Rules

- **Never use `git add -A` or `git add .`** — always add specific files
- **Check `git status` before committing** to verify only intended files are staged
- **Never commit generated files** (`__pycache__/`, `.pytest_cache/`, `node_modules/`, etc.)

### Push Early, Push Often

Commit and push after every 2-3 file changes. Do not wait until the end of a session.
