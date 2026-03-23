# CLAUDE.md — [Project Name]

## What This Is

<!-- Replace with your project's one-paragraph description -->
A project that builds itself using Claude Code scheduled tasks.

## Project Structure

```
src/               # Source code
__tests__/         # Tests
```

## Run Commands

```bash
pnpm install       # Install dependencies
pnpm build         # Build (if applicable)
pnpm typecheck     # Type check
pnpm test          # Run tests
```

## Rules

- Run `pnpm typecheck` after every file change
- Run `pnpm test` before committing
- Never use `any` types — fix the root cause
- Never use `git add -A` — add specific files
- Every new module needs tests

## Architecture Decisions

<!-- Add your project-specific architecture decisions here -->

## Skills Reference

Available skills (invoke with `/<skill-name>`):
- `/pipeline` — Run the autonomous story pipeline
