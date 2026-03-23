# Design Patterns

Patterns are multi-file change recipes. They tell the pipeline how to make cross-cutting changes that touch multiple files in a specific order.

## How patterns fit in the `.claude/` system

```
                     ┌─────────────────────────────────────────┐
                     │           Story Issue Body               │
                     │                                         │
                     │  Context: files to read                 │
                     │  Patterns: .claude/patterns/add-X.md    │
                     │  Templates: .claude/templates/module.md │
                     │  Key Types: inline definitions           │
                     └──────────┬──────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   ┌───────────┐        ┌─────────────┐        ┌────────────┐
   │  Rules    │        │  Patterns   │        │  Templates │
   │ (always)  │        │ (on demand) │        │ (on demand)│
   │           │        │             │        │            │
   │ tdd.md    │        │ Multi-file  │        │ Single-file│
   │ commit.md │        │ recipes     │        │ structure  │
   │ files.md  │        │ with order  │        │ definitions│
   └───────────┘        └─────────────┘        └────────────┘
         │                      │                      │
         │                      ▼                      │
         │              ┌─────────────┐                │
         └─────────────►│  Rubrics    │◄───────────────┘
                        │ (on demand) │
                        │             │
                        │ Quality     │
                        │ evaluation  │
                        └─────────────┘
```

- **Rules** are always loaded — they constrain every action
- **Patterns** are referenced in story bodies — they guide multi-file changes
- **Templates** are referenced by patterns — they define individual file structure
- **Rubrics** evaluate the output — they score quality after implementation

## How patterns work

1. The **epic planner** (pipeline Step 6) references patterns in story bodies
2. The **implementer** (pipeline Step 3) reads the referenced pattern before coding
3. The pattern lists exact files to touch, in order, with a checklist

## When to create a pattern

Create a pattern when you notice a recurring type of change that:
- Touches 3+ files in a specific order
- Has steps that are easy to forget (e.g., updating a barrel export)
- A new developer (or AI agent) would get wrong without guidance

If the guidance is a simple constraint ("always do X"), it's a **rule**, not a pattern.

## Pattern structure

```markdown
# Pattern: <What this change accomplishes>

When <trigger — when should someone follow this pattern>.

**Templates used:** which templates apply to the new files
**Rubrics applied:** which rubrics evaluate the output

## Files to modify (in order)

### 1. `path/to/first/file` — <what to do>
### 2. `path/to/second/file` — <what to do>

## Checklist
- [ ] Step 1 done
- [ ] Step 2 done
- [ ] Verification passes
```

## Examples for common project types

**Web API**: `add-endpoint.md`, `add-database-migration.md`, `add-middleware.md`
**React app**: `add-screen.md`, `add-component.md`, `add-hook.md`
**CLI tool**: `add-command.md`, `add-config-option.md`, `extend-output-format.md`
**Library**: `add-public-api.md`, `add-type.md`, `extend-plugin-system.md`
