# Module Template

New source modules follow this structure. Customize import patterns for your project's stack.

**Matching rubric:** `.knowledge/rubrics/code-quality.md`

## Structure

```typescript
/**
 * <Module name> — <one-line purpose>
 */

import { <named imports> } from 'node:<builtin>';     // Node builtins first
import { <named imports> } from '<dependency>';        // External deps second
import { <named imports> } from './<sibling>';         // Local imports last
import type { <type imports> } from './types';         // Type-only imports separate

/**
 * <What this function does.>
 *
 * @param paramName - <what it is>
 * @returns <what the caller gets back>
 */
export function doSomething(paramName: ParamType): ReturnType {
  // Implementation
}
```

## Rules

- One concern per module
- No `any` types — explicit parameter and return types
- JSDoc on every export
- No side effects at module level
- Errors thrown with descriptive messages

## Anti-patterns
- **Multiple concerns per file** — if a module has "and" in its description, split it
- **Positional function arguments** (`doThing(true, false, 3)`) — use an options object
- **Default exports** — named exports are greppable and refactor-friendly
- **Importing from deep internal paths** — import from barrel `index.ts` files

## Matching test

Every module must have a corresponding test file. See `.knowledge/templates/test.md`.
