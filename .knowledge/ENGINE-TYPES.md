# Knowledge Engine Types

The `.knowledge/` directory contains five types of knowledge, each with its own format and purpose.

## 1. Policy Engine (`policies/`)

**What it does:** Enforces constraints on code. ALLOW/DENY rules with explicit scope.
**When it's read:** Auto-loaded via folder CLAUDE.md when working in a governed directory.
**How it's enforced:** Structural tests in `__tests__/structure/`.

**Format:**
```markdown
# Policy: <Name>
## Scope — directories/files this governs
## Rules — ALLOW/DENY/REQUIRE statements
## Exceptions — when rules don't apply
## Anti-patterns — concrete violation examples
## Enforcement — which structural test catches violations
```

**Subcategories (by scope):**
- `architecture/` — code structure, dependency direction, file boundaries
- `data/` — storage, security, schemas
- `ui/` — styling, typography, motion, accessibility
- `state/` — hooks, stores, state management
- `testing/` — test conventions, E2E, drift detection
- `platform/` — native modules, navigation, build config

## 2. Domain Model (`models/`)

**What it does:** Describes business entities, relationships, and invariants.
**When it's read:** When implementing features that touch business logic.

**Format:**
```markdown
# Model: <Name>
## Entities — objects with fields and types
## Relationships — how entities connect
## Invariants — rules that must always be true
## Key Files — where the implementation lives
```

## 3. Templates (`templates/`)

**What it does:** Defines file structure for new files.
**When it's read:** When creating new modules, tests, stories, skills.

## 4. Patterns (`patterns/`)

**What it does:** Multi-step recipes for cross-cutting changes.
**When it's read:** When implementing a task that touches multiple files.

## 5. Rubrics (`rubrics/`)

**What it does:** Evaluates quality of output.
**When it's read:** During pipeline Step 6 (self-review).

## Operational Artifacts

**`gaps.md`** — transient work queue. Entries created by audits/pipeline when violations or missing knowledge are found. Each entry includes a test strategy. Entries removed after fix is merged.

## How They Relate

```
Audit / Knowledge-Audit / Pipeline
    ↓ discovers gaps
gaps.md (work queue)
    ↓ resolved by
Optimize / Pipeline stories
    ↓ may create new
Policies (constraints) ←── with structural test
    ↓ enforced by
Structural Tests
    ↓ informed by
Domain Models (business context)

Patterns (how to build)
    ↓ references
Templates (file structure)
    ↓ evaluated by
Rubrics (quality check)
```
