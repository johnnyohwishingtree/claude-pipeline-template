# File Conventions

## The `.claude/` directory

All Claude Code pipeline artifacts live under `.claude/`. This is the universal namespace — every project uses the same structure:

```
.claude/
├── skills/        # Autonomous workflows (pipeline, verify, etc.)
├── rules/         # Always-on constraints (this directory)
├── templates/     # Single-file structure definitions
├── rubrics/       # Quality evaluation criteria
└── patterns/      # Multi-file change recipes
```

If your project uses an external tool that needs its own config (e.g., a quality harness), that tool gets its own dotfile directory (e.g., `.toolname/`). Only runtime data goes there — templates, rubrics, and patterns always live in `.claude/`.

## Source file conventions

<!-- CUSTOMIZE: Replace these with your project's actual conventions -->

- **One concern per file.** If two exported functions don't share private state, they belong in separate files.
- **Colocate tests with source.** Tests mirror the source tree: `src/foo/bar.ts` → `__tests__/foo/bar.test.ts`.
- **Named folders for complex modules.** When a module has colocated assets (screenshots, fixtures, sub-components), use a named folder with an index:
  ```
  src/screens/profile/
  └── EditProfile/
      ├── EditProfile.tsx        # The screen
      ├── __screenshots__/       # Visual snapshots (colocated)
      └── index.ts               # Barrel re-export
  ```
- **Barrel exports.** Every directory with multiple modules gets an `index.ts` that re-exports public API. Import from the barrel, not from internal files.
- **Keep files under 500 lines.** When a file exceeds this, split it into a subdirectory with a barrel `index.ts`.

## Naming conventions

- `camelCase` for functions and variables
- `PascalCase` for types, interfaces, classes, and components
- `kebab-case` for file names (or `PascalCase` for component files if your framework expects it)
- `UPPER_SNAKE_CASE` for constants
