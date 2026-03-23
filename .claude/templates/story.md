**Parent Epic:** #<epic_number>

## Description

<What needs to be implemented. Be specific — name the functions, files, and behaviors. Avoid vague verbs like "handle", "process", "deal with".>

## Acceptance Criteria

- [ ] <Observable outcome, not just "implementation complete">
- [ ] <Another observable outcome>
- [ ] All new functions have tests (happy path + at least one error path)
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm test` passes with all tests green

## Files to Create/Modify

- `<path/to/file.ts>` — <what changes>
- `<path/to/file.test.ts>` — <what tests>

## Context (read these before implementing)

<List the minimum files/line-ranges the implementer needs to read. This prevents exploratory reading of the entire codebase.>

- `<path/to/file.ts>` — <why: "you're adding a function here">
- `<path/to/file.ts:N-M>` — <why: "see how existing commands are structured">

## Patterns & Templates

<Which patterns/templates apply to this story? Read these INSTEAD of reverse-engineering conventions from existing code.>

- `.claude/patterns/<relevant>.md` — <when to follow it>
- `.claude/templates/<relevant>.md` — <which files to structure this way>

If none apply, write "Standard — follow `templates/module.md` and `templates/test.md`."

## Key Types

<Inline the type definitions the implementer needs. Avoids reading type files for a few lines.>

```typescript
// Only the types relevant to this story
interface ExampleType {
  field: string;
}
```

## Dependencies

None / Depends on #<number>

## Verification Notes

<Any specific things to check. Leave blank if standard verification is sufficient.>
