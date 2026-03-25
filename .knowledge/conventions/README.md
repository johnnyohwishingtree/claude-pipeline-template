# Conventions

Project-specific rules that apply to THIS codebase. Unlike concepts (universal) these are choices your project made.

## Single-file conventions
- `testing.md` — test framework, patterns, coverage expectations
- `styling.md` — CSS framework, design tokens, component patterns
- `storage.md` — where data lives, encryption rules, backup policies
- `api.md` — REST conventions, auth patterns, error response format

## When to use a subdirectory

When a convention grows beyond ~100 lines or has multiple sub-topics, promote it to a directory:

```
conventions/
  testing.md              ← single file (simple convention)
  accessibility/          ← directory (complex convention)
    core-principles.md
    component-props.md
    testing-patterns.md
    utilities.md
```

**Promote to a directory when:**
- The file exceeds 100 lines
- It has 3+ distinct sub-topics that agents would read independently
- Different stories need different parts of it (e.g., a UI story needs component props but not testing patterns)

**Keep as a single file when:**
- Under 100 lines
- All the content is relevant whenever any of it is relevant

The same rule applies to `concepts/` and `domain/` — any knowledge file that grows too large gets promoted to a subdirectory with focused files.

Create a convention file when you notice the pipeline making inconsistent choices about something project-specific.
