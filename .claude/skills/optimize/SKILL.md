---
name: optimize
description: Resolve known gaps in the knowledge graph — add missing guidance, compress bloated files
argument-hint: "[--dry-run]"
---

# /optimize — Resolve Gaps and Compress Knowledge

Reads `.knowledge/gaps.md` for pending findings, resolves them by updating knowledge or flagging code fixes, and compresses files that have grown too long.

## Step 1: Read gaps

```bash
cat .knowledge/gaps.md 2>/dev/null || echo "No gaps.md found"
```

If `gaps.md` doesn't exist or has no entries → skip to Step 3.

## Step 2: Resolve each gap

### Knowledge updates

For each entry under `## Knowledge updates`:

1. Read the referenced `.knowledge/` file
2. Add the missing guidance — be specific, include code examples from the reference
3. Remove the resolved entry from `gaps.md`
4. Commit:
   ```bash
   git add .knowledge/<path>.md .knowledge/gaps.md
   git commit -m "optimize: add guidance to <file>"
   ```

### Code fixes

Entries under `## Code fixes` are for the pipeline to handle via fix stories.
- If a fix story already exists for the entry → leave it
- If no fix story exists → create one (follow `.knowledge/templates/story.md`)
- **Include the test strategy** from the gap entry in the story's acceptance criteria. Every fix must have a test that prevents recurrence.
- Add reminder in the story body: "After completing fixes, remove resolved entries from `.knowledge/gaps.md`."

### Drift

Entries under `## Drift` — fix the drift directly if it's a documentation/config issue. If it requires code changes, create a fix story.

## Step 3: Compress bloated files

Check file sizes:
```bash
for f in $(find .knowledge -name "*.md" -not -name "README.md" -not -name "gaps.md"); do
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

## Step 4: Clean up gaps.md

If all entries have been resolved or converted to stories, delete `gaps.md`:
```bash
# Only delete if no entries remain
if ! grep -q "^- " .knowledge/gaps.md 2>/dev/null; then
  rm .knowledge/gaps.md
  git add .knowledge/gaps.md
  git commit -m "optimize: all gaps resolved, removing gaps.md"
fi
```

## Step 5: Push

```bash
git push origin master
```
