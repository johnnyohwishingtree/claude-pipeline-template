---
name: optimize
description: Resolve known gaps in the knowledge graph — add missing guidance, compress bloated files
argument-hint: "[--dry-run]"
---

# /optimize — Resolve Gaps and Compress Knowledge

Scans `.knowledge/` for `## Known gaps` sections, resolves them by adding guidance, and compresses files that have grown too long.

## Step 1: Find gaps

```bash
for f in $(find .knowledge -name "*.md" -not -name "README.md"); do
  if grep -q "## Known gaps" "$f" 2>/dev/null; then
    GAPS=$(sed -n '/## Known gaps/,/^## [^K]/p' "$f" | grep "^- " | wc -l | tr -d ' ')
    if [ "$GAPS" -gt 0 ]; then
      echo "$f: $GAPS gaps"
    fi
  fi
done
```

If no gaps found → skip to Step 3.

## Step 2: Resolve each gap

For each gap entry (e.g., `- mocking execFileSync — found in guardrail.test.ts (#167)`):

1. Read the "found in" reference to understand the pattern
2. Add guidance to the SAME file, in the appropriate section above the gaps
3. Remove the resolved gap entry
4. If no gaps remain, remove the `## Known gaps` section entirely

**Be specific.** Include code examples from the reference. Not "remember to mock" but the actual mock code.

Commit each file separately:
```bash
git add .knowledge/<path>.md
git commit -m "optimize: resolve gap in <file> (#story_numbers)"
```

## Step 3: Compress bloated files

Check file sizes:
```bash
for f in $(find .knowledge -name "*.md" -not -name "README.md"); do
  LINES=$(wc -l < "$f" | tr -d ' ')
  if [ "$LINES" -gt 150 ]; then
    echo "BLOATED: $f ($LINES lines)"
  fi
done
```

For each bloated file:
1. Read the full content
2. Rewrite it to be concise — keep all knowledge but remove redundancy, merge overlapping sections, tighten examples
3. Target: under 100 lines
4. Git history preserves the full version if anything important was lost

## Step 4: Push

```bash
git push origin master
```
