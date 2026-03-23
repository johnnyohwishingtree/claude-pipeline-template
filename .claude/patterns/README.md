# Design Patterns

Patterns are multi-file change recipes. They tell the pipeline how to make cross-cutting changes that touch multiple files in a specific order.

## How patterns work

1. The **epic planner** (pipeline Step 6) references patterns in story bodies
2. The **implementer** (pipeline Step 3) reads the referenced pattern before coding
3. The pattern lists exact files to touch, in order, with a checklist

## When to create a pattern

Create a pattern when you notice a recurring type of change that:
- Touches 3+ files in a specific order
- Has steps that are easy to forget (e.g., updating a barrel export)
- A new developer (or AI agent) would get wrong without guidance

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
