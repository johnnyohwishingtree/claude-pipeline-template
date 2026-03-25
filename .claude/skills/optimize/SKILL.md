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

For each bloated file, choose one of two strategies:

**Compress** (if content is cohesive — one topic with too many words):
1. Rewrite to be concise — keep all knowledge, remove redundancy, tighten examples
2. Target: under 100 lines

**Promote to directory** (if content has 3+ distinct sub-topics):
1. Create a directory with the same name: `conventions/testing/`
2. Split into focused files: `core.md`, `mocking.md`, `e2e.md`
3. Each file should be independently useful — an agent reading one doesn't need the others
4. Delete the original file (or convert to a README.md in the new directory)

Choose promote over compress when different stories would need different parts of the file.

Git history preserves the full version if anything important was lost.

## Step 4: Push

```bash
git push origin master
```
