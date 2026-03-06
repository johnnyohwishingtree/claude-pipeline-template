---
name: organize
description: Reorganize file structure so tests mirror source
---

# Organize

Reorganize the file structure so that tests mirror the source layout and files are in their correct locations.

## Steps

1. **Map source to test files** — every source module should have a corresponding test file
2. **Identify misplaced files** — files in the wrong directory
3. **Move files** using `git mv` to preserve history
4. **Update imports** in all files that reference moved modules
5. **Run tests** to verify nothing is broken
