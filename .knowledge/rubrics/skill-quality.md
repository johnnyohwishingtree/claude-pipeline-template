# Skill Quality Rubric

Evaluate skill files (following `.claude/templates/skill.md`) against these criteria.

## Clarity (weight: 30%)
- Every step has an explicit bash command or concrete action
- Success and failure paths are both defined for every step that can fail
- No implicit assumptions — if a tool/command is needed, it's spelled out
- Steps are numbered and sequential with clear control flow

## Completeness (weight: 25%)
- Error recovery paths exist: what happens when a step fails?
- The skill has a clear entry condition and exit condition
- State transitions are explicit: what labels/status change at each phase?

## Self-Awareness (weight: 20%)
- If the skill modifies code it references, it includes a self-update check
- The skill reads files at runtime, not from memory
- The skill doesn't hardcode values that come from config

## Efficiency (weight: 15%)
- No redundant steps
- Long operations happen early so failures are caught before wasting work
- Context is loaded once and reused

## Anti-Patterns (weight: 10%)
- No "hope-based" merging — always verify before merge
- No silent failures — every command that can fail has its output checked
- No unbounded loops — retry limits are explicit
