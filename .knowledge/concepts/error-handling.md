# Error Handling

Functions that can fail should communicate failure clearly, not silently.

## Principles
- Return meaningful error messages, not generic "something went wrong"
- Throw at the point of failure with context (what was expected, what happened)
- Never swallow errors with empty catch blocks
- External calls (network, filesystem, CLI) always need error handling

## Applies to
- Core modules: return result types or throw with descriptive messages
- CLI commands: catch errors, print user-friendly message, exit with non-zero code
- Pipeline steps: log what failed before retrying

## Anti-patterns
- **Empty catch blocks** (`catch (e) {}`) — at minimum log the error; never silently swallow
- **Generic error messages** (`throw new Error('Failed')`) — include what was expected and what happened
- **Using `|| true` to suppress failures** — hides real errors; fix the root cause
- **Catching and re-throwing without context** — add the operation name: `throw new Error(\`Failed to parse ${file}: ${e.message}\`)`
- **Returning `null` instead of throwing** — callers forget to check; prefer result types or explicit throws
