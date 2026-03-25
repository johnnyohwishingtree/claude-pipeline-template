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

## Known gaps
<!-- Pipeline adds gaps here when error handling patterns are discovered -->
