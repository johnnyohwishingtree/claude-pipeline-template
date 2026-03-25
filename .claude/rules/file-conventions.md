# File Conventions

## The `.claude/` directory (read-only)

Platform directory. Auto-loaded by Claude Code. The pipeline reads these but never edits them.

```
.claude/
├── skills/        # Autonomous workflows (pipeline, audit, optimize)
├── rules/         # Always-on constraints (this directory)
├── settings.json  # Permissions
└── index.md       # System manifest
```

## The `.knowledge/` directory (read-write)

Project knowledge graph. The pipeline creates and updates these files freely.

```
.knowledge/
├── concepts/      # Cross-cutting principles (drift detection, error handling)
├── conventions/   # Project-specific rules (testing, styling, storage)
├── domain/        # Business logic knowledge
├── templates/     # File structure definitions
├── patterns/      # Multi-file change recipes
└── rubrics/       # Quality evaluation criteria
```

Any `.knowledge/` file can have a `## Known gaps` section. The pipeline adds gaps during Step 5. The /optimize skill resolves them.

## Source file conventions

<!-- CUSTOMIZE: Replace with your project's conventions -->

- **One concern per file.** If two exported functions don't share private state, they belong in separate files.
- **Colocate tests with source.** Tests mirror the source tree.
- **Barrel exports.** Every directory with multiple modules gets an `index.ts`.
- **Keep files under 500 lines.** Split into subdirectory with barrel if exceeded.

## Naming conventions

- `camelCase` for functions and variables
- `PascalCase` for types, interfaces, classes, components
- `kebab-case` for file names
- `UPPER_SNAKE_CASE` for constants
