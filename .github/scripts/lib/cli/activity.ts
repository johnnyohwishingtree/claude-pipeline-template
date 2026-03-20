#!/usr/bin/env tsx
/**
 * CLI entry point for activity workflow primitives.
 * Replaces: source workflow.sh; activity_start/success/fail
 *
 * Usage:
 *   npx tsx .github/scripts/lib/cli/activity.ts start <issue> <activity> <from_state1> [<from_state2> ...]
 *   npx tsx .github/scripts/lib/cli/activity.ts success <issue> <next_state>
 *   npx tsx .github/scripts/lib/cli/activity.ts fail <issue> <activity> <error_context> [<retry_workflow>]
 *   npx tsx .github/scripts/lib/cli/activity.ts get-attempt <issue> <activity>
 *   npx tsx .github/scripts/lib/cli/activity.ts reset-attempts <issue> <activity>
 *
 * Environment:
 *   GH_PAT              — GitHub token
 *   GITHUB_REPOSITORY   — owner/repo
 *   GITHUB_RUN_ID       — current run ID (for lock_id)
 *
 * Output: JSON to stdout
 * Exit code: 0 = success, 1 = skip/fail
 */

import { GitHubClient } from '../github.js';
import { ActivityRunner } from '../workflow.js';
import type { ActivityType, PipelineState } from '../types.js';

function getGitHub(): GitHubClient {
  const token = process.env['GH_PAT'] ?? process.env['GH_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];

  if (!token || !repo) {
    console.error('Error: GH_PAT and GITHUB_REPOSITORY are required');
    process.exit(1);
  }

  return new GitHubClient({ token, repo });
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    console.error('Usage: activity <start|success|fail|get-attempt|reset-attempts> ...');
    process.exit(1);
  }

  const github = getGitHub();
  const runner = new ActivityRunner(github);

  switch (command) {
    case 'start': {
      const [issueStr, activity, ...fromStates] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !activity || fromStates.length === 0) {
        console.error('Usage: activity start <issue> <activity> <from_state1> [<from_state2> ...]');
        process.exit(1);
      }
      const ctx = await runner.activityStart(
        issue,
        activity as ActivityType,
        fromStates as PipelineState[],
        process.env['GITHUB_RUN_ID']
      );
      if (!ctx) {
        console.log(JSON.stringify({ proceed: false }));
        process.exit(1);
      }
      console.log(JSON.stringify({ proceed: true, lockId: ctx.lockId }));
      break;
    }

    case 'success': {
      const [issueStr, nextState] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !nextState) {
        console.error('Usage: activity success <issue> <next_state>');
        process.exit(1);
      }
      // Reconstruct context from env
      const activityName = process.env['ACTIVITY_NAME'] as ActivityType;
      const lockId = process.env['ACTIVITY_LOCK_ID'] ?? `${activityName}-${process.env['GITHUB_RUN_ID'] ?? process.pid}`;
      const ctx = { issueNumber: issue, activityName, lockId };
      const result = await runner.activitySuccess(ctx, nextState as PipelineState);
      console.log(JSON.stringify({ state: result.state }));
      break;
    }

    case 'fail': {
      const [issueStr, activity, errorContext, retryWorkflow] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !activity || !errorContext) {
        console.error('Usage: activity fail <issue> <activity> <error_context> [<retry_workflow>]');
        process.exit(1);
      }
      const lockId = process.env['ACTIVITY_LOCK_ID'] ?? `${activity}-${process.env['GITHUB_RUN_ID'] ?? process.pid}`;
      const ctx = { issueNumber: issue, activityName: activity as ActivityType, lockId };
      const retry = retryWorkflow ? { workflowFile: retryWorkflow, branch: 'master' } : undefined;
      const result = await runner.activityFail(ctx, errorContext, retry);
      console.log(JSON.stringify(result));
      process.exit(result.retried ? 0 : 1);
      break;
    }

    case 'get-attempt': {
      const [issueStr, activity] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !activity) {
        console.error('Usage: activity get-attempt <issue> <activity>');
        process.exit(1);
      }
      const attempt = await runner.activityGetAttempt(issue, activity as ActivityType);
      console.log(JSON.stringify({ attempt }));
      break;
    }

    case 'reset-attempts': {
      const [issueStr, activity] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !activity) {
        console.error('Usage: activity reset-attempts <issue> <activity>');
        process.exit(1);
      }
      await runner.activityResetAttempts(issue, activity as ActivityType);
      console.log(JSON.stringify({ reset: true }));
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
