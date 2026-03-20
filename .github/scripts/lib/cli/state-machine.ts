#!/usr/bin/env tsx
/**
 * CLI entry point for state machine operations.
 * Replaces: source state-machine.sh; transition/read_state/get_state
 *
 * Usage:
 *   npx tsx .github/scripts/lib/cli/state-machine.ts transition <issue> <state>
 *   npx tsx .github/scripts/lib/cli/state-machine.ts get-state <issue>
 *   npx tsx .github/scripts/lib/cli/state-machine.ts read-state <issue>
 *
 * Environment:
 *   GH_PAT              — GitHub token
 *   GITHUB_REPOSITORY   — owner/repo
 *
 * Output: JSON to stdout
 */

import { GitHubClient } from '../github.js';
import { PipelineStateMachine } from '../state-machine.js';
import type { PipelineState } from '../types.js';

function getGitHub(): GitHubClient {
  const token = process.env['GH_PAT'] ?? process.env['GH_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];

  if (!token || !repo) {
    console.error('Error: GH_PAT/GH_TOKEN and GITHUB_REPOSITORY are required');
    process.exit(1);
  }

  return new GitHubClient({ token, repo });
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    console.error('Usage: state-machine <transition|get-state|read-state> ...');
    process.exit(1);
  }

  const github = getGitHub();
  const sm = new PipelineStateMachine(github);

  switch (command) {
    case 'transition': {
      const [issueStr, state] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !state) {
        console.error('Usage: state-machine transition <issue> <state>');
        process.exit(1);
      }
      const result = await sm.transition(issue, state as PipelineState);
      console.log(JSON.stringify({ state: result.state }));
      break;
    }

    case 'get-state': {
      const [issueStr] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue)) {
        console.error('Usage: state-machine get-state <issue>');
        process.exit(1);
      }
      const state = await sm.getState(issue);
      console.log(JSON.stringify({ state }));
      break;
    }

    case 'read-state': {
      const [issueStr] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue)) {
        console.error('Usage: state-machine read-state <issue>');
        process.exit(1);
      }
      const data = await sm.readState(issue);
      console.log(JSON.stringify(data ?? { state: 'unknown' }));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
