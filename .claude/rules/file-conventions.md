# File Conventions

## The `.claude/` directory (read-only)

Platform directory. Auto-loaded by Claude Code. The pipeline reads these but never edits them.

```
.claude/
├── skills/        # Autonomous workflows (pipeline, audit, optimize)
├── rules/         # Always-on constraints (this directory)
└── settings.json  # Permissions
```

## The `.knowledge/` directory (read-write)

Project knowledge graph. The pipeline creates and updates these files freely.

```
.knowledge/
├── index.md       # System manifest — kept in sync by /audit
├── concepts/      # Cross-cutting principles
├── conventions/   # Project-specific rules
├── domain/        # Business logic knowledge
├── templates/     # File structure definitions
├── patterns/      # Multi-file change recipes
└── rubrics/       # Quality evaluation criteria
```

Gaps found by /audit or /pipeline are written to `.knowledge/gaps.md`. Fix stories remove entries when resolved.

## Source file conventions

<!-- CUSTOMIZE: Replace with your project's conventions -->

- **One concern per file.** If two exported functions don't share private state, they belong in separate files.
- **Colocate tests with source.** Tests mirror the source tree.
- **Keep files under 500 lines.** Split into subdirectory if exceeded.

## Naming conventions

<!-- CUSTOMIZE: Replace with your language's conventions -->
- Consistent casing for functions, types, files, and constants
- Follow the conventions of your language and framework
