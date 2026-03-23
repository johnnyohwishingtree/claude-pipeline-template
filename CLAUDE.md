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

Rules in `.claude/rules/` are auto-loaded into every Claude session. See `.claude/rules/README.md` for how rules, templates, patterns, and rubrics relate.

- `tdd.md` — Write a failing test before fixing any bug
- `commit-gate.md` — Run typecheck + tests before every commit
- `file-conventions.md` — Project structure, naming, and the `.claude/` directory layout

## Architecture Decisions

<!-- Add your project-specific architecture decisions here -->

## Skills Reference

Available skills (invoke with `/<skill-name>`):
- `/pipeline` — Run the autonomous story pipeline
