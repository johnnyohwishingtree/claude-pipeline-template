# Update Index on System Changes

When you add, remove, or rename any file in `.claude/` or `.knowledge/`, update `.knowledge/index.md` to reflect the change.

The index is the single lookup table for the entire system. If it's stale, the pipeline reads the wrong files or misses new ones.

Also update `CLAUDE.md` if the change affects the project's rules or skills reference sections.
