#!/usr/bin/env bash
set -euo pipefail

# Setup script for Claude Autonomous Pipeline
# Usage: ./scripts/setup-repo.sh owner/repo-name

REPO="${1:-}"

if [ -z "$REPO" ]; then
  echo "Usage: $0 owner/repo-name"
  echo "Example: $0 myorg/my-project"
  exit 1
fi

echo "=== Setting up pipeline for $REPO ==="

# 1. Repo settings
echo ""
echo "--- Configuring repo settings ---"
gh api "repos/$REPO" --method PATCH \
  -f allow_auto_merge=true \
  -f delete_branch_on_merge=true \
  --silent
echo "Enabled: allow_auto_merge, delete_branch_on_merge"

# 2. Branch ruleset
echo ""
echo "--- Creating branch ruleset ---"

# Check for existing ruleset
EXISTING=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "No Human Merge to main") | .id' 2>/dev/null || echo "")

if [ -n "$EXISTING" ]; then
  echo "Ruleset already exists (id: $EXISTING) — updating"
  METHOD="PUT"
  URL="repos/$REPO/rulesets/$EXISTING"
else
  METHOD="POST"
  URL="repos/$REPO/rulesets"
fi

gh api "$URL" --method "$METHOD" --input - <<'RULES' --silent
{
  "name": "No Human Merge to main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge", "squash", "rebase"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": true,
        "required_reviewers": []
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {"context": "test", "integration_id": 15368}
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
RULES
echo "Ruleset configured: require PRs, test check, conversation resolution, no force push/delete"

# 3. Labels
echo ""
echo "--- Creating pipeline labels ---"

create_label() {
  local name="$1" color="$2" desc="$3"
  if gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null; then
    echo "Created label: $name"
  else
    echo "Label exists: $name"
  fi
}

create_label "pending"        "FBCA04" "Story waiting to be picked up"
create_label "in-progress"    "0E8A16" "Story currently being worked on"
create_label "completed"      "0075CA" "Story completed and merged"
create_label "pipeline-stuck" "D93F0B" "Pipeline exceeded max retries — needs human review"
create_label "epic"           "5319E7" "Epic issue grouping related stories"
create_label "story"          "1D76DB" "Implementable unit of work"

# 4. Verify secrets
echo ""
echo "--- Checking secrets ---"
echo "Note: GitHub API cannot read secret values, only verify they exist."
echo ""
echo "Required secrets (set via Settings > Secrets > Actions):"

for SECRET in CLAUDE_CODE_OAUTH_TOKEN GH_PAT; do
  EXISTS=$(gh api "repos/$REPO/actions/secrets/$SECRET" --jq '.name' 2>/dev/null || echo "")
  if [ -n "$EXISTS" ]; then
    echo "  $SECRET — set"
  else
    echo "  $SECRET — MISSING (pipeline will not work without this)"
  fi
done

echo ""
echo "=== Setup complete for $REPO ==="
