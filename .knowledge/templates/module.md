# Module Template

New source modules follow this structure. Customize for your project's language and stack.

**Matching rubric:** `.knowledge/rubrics/code-quality.md`

## Structure

<!-- CUSTOMIZE: Replace with your language's conventions -->
```
/**
 * <Module name> — <one-line purpose>
 */

// Imports: stdlib first, external deps second, local imports last

/**
 * <What this function does.>
 *
 * @param paramName - <what it is>
 * @returns <what the caller gets back>
 */
export function doSomething(paramName, options) {
  // Implementation
}
```

## Rules

- One concern per module
- Explicit parameter and return types
- Document every export
- No side effects at module level
- Errors thrown with descriptive messages

## Anti-patterns
- **Multiple concerns per file** — if a module has "and" in its description, split it
- **Positional function arguments** (`doThing(true, false, 3)`) — use an options object or named parameters
- **Importing from deep internal paths** — import from the module's public API

## Matching test

Every module must have a corresponding test file. See `.knowledge/templates/test.md`.
