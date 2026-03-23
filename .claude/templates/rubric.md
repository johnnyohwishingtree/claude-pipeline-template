# Rubric Template

Rubric files define quality criteria for evaluating code. Each rubric matches a template.

## Structure

```markdown
# <Domain> Quality Rubric

Evaluate <what> against these criteria.

## <Category 1> (weight: N%)
- <Specific, observable criterion>
- <Another criterion>

## <Category 2> (weight: N%)
- <Criterion>
```

## Rules

- Weights must sum to 100%
- 2-5 categories
- Every criterion is observable (can verify by reading code or running a command)
- No subjective criteria like "code feels clean"
- Name the matching template at the top

## Template-Rubric pairs

| Template | Rubric | What it covers |
|----------|--------|----------------|
| `templates/module.md` | `rubrics/code-quality.md` | Source modules |
| `templates/test.md` | `rubrics/test-quality.md` | Test files |
| `templates/skill.md` | `rubrics/skill-quality.md` | Skill definitions |
| `templates/rubric.md` | Self | Rubric files |

## Design Patterns

Patterns are multi-file change recipes. They reference templates and rubrics.
Add your project-specific patterns to `.claude/patterns/` and list them here.
