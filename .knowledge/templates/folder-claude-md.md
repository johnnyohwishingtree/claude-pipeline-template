# Template: Folder-level CLAUDE.md

When you discover directory-specific conventions during implementation, create a CLAUDE.md in that directory as a pointer to the relevant `.knowledge/` files.

## Structure

```markdown
# <Directory Name>

<One line: what this directory contains and the key rule>

See: .knowledge/<path>.md
```

## Rules

- **Maximum 5 lines.** If you need more, the content belongs in `.knowledge/`, not here.
- **Pointers only.** No detailed instructions — those live in `.knowledge/` where the pipeline can improve them.
- **Every "See:" link must point to a file that exists.** Create the `.knowledge/` file first if needed.
- **Only create when there's a genuine directory-specific convention.** Don't create CLAUDE.md files for every directory — only where an agent working there needs to know something non-obvious.

## Examples

```markdown
# Services

Lowest level — never import stores or UI code. Accept runtime state as parameters.

See: .knowledge/concepts/dependency-direction.md
```

```markdown
# Tests

Mirrors src/ structure. Each source file has a matching test file.

See: .knowledge/conventions/testing.md
```

```markdown
# Components

Receive data via props only. No direct store or service imports.

See: .knowledge/concepts/dependency-direction.md
```
