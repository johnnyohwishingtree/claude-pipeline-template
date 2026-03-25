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
# Schemas
Country form schemas. Every field needs autoFillSource for smart delta.
See: .knowledge/domain/form-engine.md
```

```markdown
# Hooks
Custom hooks extracted from screens. Hooks own state + effects, screens are thin render layers.
See: .knowledge/conventions/state-management.md
```

```markdown
# Stores
Zustand stores. Stores never import other stores — cross-store coordination belongs in hooks.
See: .knowledge/concepts/dependency-direction.md
```
