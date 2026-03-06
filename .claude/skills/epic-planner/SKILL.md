---
name: epic-planner
description: Break a high-level goal into an Epic issue with ordered Story issues on GitHub
argument-hint: "[goal description]"
---

# Epic Planner

Break a high-level goal into a structured set of GitHub Issues: one Epic and 3-8 Stories.

## Before Planning

1. Read `CLAUDE.md` for project context and architecture
2. Understand where the goal fits in the existing codebase
3. Check if any existing code can be reused

## Epic Structure

An **Epic** is a high-level goal. **Stories** are the implementation units.

Rules:
- Each story should be completable in a single Claude session
- Stories have clear dependencies (Story 2 may depend on Story 1)
- Each story specifies which skill to use (`/plan-feature`, `/test-suite`, etc.)
- Stories are created sequentially — issue number defines execution order
- Maximum 8 stories per epic

## Typical Story Ordering

1. **Foundation** — create module skeleton, base classes, config entries
2. **Core logic** — implement the main algorithm/feature
3. **Integration** — connect to existing modules, handle edge cases
4. **Tests** — fill test coverage gaps
5. **Documentation** — update docs, architecture diagrams

## Creating Issues

Use `gh` CLI to create issues.

### Create labels first

```bash
gh label create "epic:<slug>" --color "0E8A16" --description "Epic: <title>" 2>/dev/null || true
```

### Create the Epic

```bash
gh issue create \
  --title "Epic: <goal description>" \
  --label "epic" \
  --label "epic:<slug>" \
  --body "$(cat <<'EOF'
## Goal
<what we're trying to achieve>

## Stories
- [ ] #__ Story 1: <title>
- [ ] #__ Story 2: <title>
...

## Success Criteria
- <how we know it's done>
EOF
)"
```

### Create Each Story

```bash
gh issue create \
  --title "Story: <specific task>" \
  --label "story" \
  --label "pending" \
  --label "epic:<slug>" \
  --body "$(cat <<'EOF'
**Parent Epic:** #<epic_number>
**Skill:** /plan-feature (or /test-suite, etc.)

## Description
<what needs to be implemented>

## Acceptance Criteria
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Documentation updated if needed

## Files to Create/Modify
- <file paths>

## Dependencies
Depends on #<previous_story_number> (if applicable)
EOF
)"
```

### After Creating All Stories

Update the epic's body with the actual issue numbers:
```bash
gh issue edit <epic_number> --body "..."
```

### Verify Labels

```bash
# Epic must have: epic, epic:<slug>
gh issue view <epic_number> --json labels -q '.labels[].name'

# Stories must have: story, pending, epic:<slug>
gh issue view <story_number> --json labels -q '.labels[].name'
```

## Output

After running this skill:
1. One Epic issue created with goal, story checklist, success criteria
2. 3-8 Story issues created with skill reference, acceptance criteria, file lists
3. All stories labeled correctly for the orchestrator workflow
4. Summary printed: epic number, story numbers, execution order

## Starting the Pipeline

Tell the user: "To start autonomous implementation, comment `@claude` on Story #<first_story_number>."
