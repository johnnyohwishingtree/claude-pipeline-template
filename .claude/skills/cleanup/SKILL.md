---
name: cleanup
description: Find and remove unused, temporary, or accidentally committed files
---

# Cleanup

Find and remove unused, temporary, or accidentally committed files from the repository.

## Steps

1. **Check for generated files** that shouldn't be in git:
   - `__pycache__/`, `.pytest_cache/`, `node_modules/`
   - Coverage reports, build artifacts
   - `.hypothesis/`, `.mypy_cache/`

2. **Check for unused source files** — modules that are never imported

3. **Check for temporary files** — `*.tmp`, `*.bak`, test output files

4. **Remove identified files** using `git rm` for tracked files

5. **Update `.gitignore`** if needed to prevent re-addition

6. **Run tests** to verify nothing is broken
