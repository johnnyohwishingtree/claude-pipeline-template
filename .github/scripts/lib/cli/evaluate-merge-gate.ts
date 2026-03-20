#!/usr/bin/env tsx
/**
 * CLI entry point for merge gate evaluation.
 * Replaces: ./evaluate-merge-gate.sh <pr_number>
 *
 * Usage: npx tsx .github/scripts/lib/cli/evaluate-merge-gate.ts <pr_number>
 *
 * Environment:
 *   GH_PAT             — GitHub token
 *   GITHUB_REPOSITORY   — owner/repo
 *
 * Output: JSON to stdout (same format as the bash version)
 */

import { GitHubClient } from '../github.js';
import { evaluateMergeGate } from '../merge-gate.js';

async function main() {
  const prNumber = parseInt(process.argv[2], 10);
  if (isNaN(prNumber)) {
    console.error('Usage: evaluate-merge-gate <pr_number>');
    process.exit(1);
  }

  const token = process.env['GH_PAT'] ?? process.env['GH_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];

  if (!token || !repo) {
    console.error('Error: GH_PAT and GITHUB_REPOSITORY are required');
    process.exit(1);
  }

  const github = new GitHubClient({ token, repo });
  const result = await evaluateMergeGate(github, prNumber);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
