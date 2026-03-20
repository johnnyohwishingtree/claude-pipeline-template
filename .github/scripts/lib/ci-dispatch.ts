/**
 * CI Dispatch — extracts inline shell logic from test.yml and e2e-smoke.yml.
 *
 * Handles:
 * - Checking PR labels (e.g., "no-autofix" opt-out)
 * - Extracting failed jobs/steps from a workflow run
 * - Dispatching verify-and-fix for PR failures
 * - Dispatching verify-and-fix for master push failures
 */

import { execFileSync } from 'node:child_process';
import { GitHubClient } from './github.js';

function exec(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/**
 * Check if a PR has a specific label.
 */
export function hasLabel(pr: number, label: string, repo: string): boolean {
  try {
    const raw = exec('gh', [
      'pr', 'view', String(pr),
      '--repo', repo,
      '--json', 'labels',
      '-q', '[.labels[].name] | join(",")',
    ]);
    return raw.split(',').includes(label);
  } catch {
    return false;
  }
}

/**
 * Extract failed job names or step names from a workflow run.
 *
 * mode = 'jobs':  returns failed job names (e2e-smoke pattern)
 * mode = 'steps': returns failed step names (test.yml pattern)
 */
export function getFailedItems(runId: string, mode: 'jobs' | 'steps'): string {
  try {
    const jqFilter =
      mode === 'jobs'
        ? '[.jobs[] | select(.conclusion == "failure") | .name] | join(", ")'
        : '[.jobs[].steps[] | select(.conclusion == "failure") | .name] | unique | join(", ")';
    return exec('gh', ['run', 'view', runId, '--json', 'jobs', '-q', jqFilter]) || 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface DispatchPRFixOptions {
  pr: number;
  branch: string;
  runId: string;
  runUrl: string;
  repo: string;
  checks: 'ci' | 'e2e';
  /** Extra context appended to fix_context */
  extraContext?: string;
}

/**
 * Dispatch verify-and-fix for a PR failure.
 *
 * 1. Checks for "no-autofix" label (skips if present)
 * 2. Extracts failed jobs/steps from the run
 * 3. Posts a comment on the PR
 * 4. Dispatches verify-and-fix
 */
export async function dispatchPRFix(
  github: GitHubClient,
  opts: DispatchPRFixOptions
): Promise<{ skipped: boolean; failedItems: string }> {
  if (hasLabel(opts.pr, 'no-autofix', opts.repo)) {
    return { skipped: true, failedItems: '' };
  }

  const itemMode = opts.checks === 'e2e' ? 'jobs' : 'steps';
  const failedItems = getFailedItems(opts.runId, itemMode);
  const label = opts.checks === 'e2e' ? 'E2E smoke tests' : 'CI checks';

  await github.commentOnIssue(
    opts.pr,
    `${label} failed (${failedItems}). Dispatching verify-and-fix with auto-retry. [View run](${opts.runUrl})`
  );

  const fixContext = opts.checks === 'e2e'
    ? `E2E tests failed on PR #${opts.pr}. Failed jobs: ${failedItems}. Run: ${opts.runUrl}.`
    : `CI failed on PR #${opts.pr}. Failed steps: ${failedItems}. Run: ${opts.runUrl}`;

  await github.dispatchWorkflow('verify-and-fix.yml', 'master', {
    branch: opts.branch,
    issue_number: String(opts.pr),
    checks: opts.checks,
    fix_enabled: 'true',
    max_attempts: '3',
    fix_context: opts.extraContext ? `${fixContext} ${opts.extraContext}` : fixContext,
  });

  return { skipped: false, failedItems };
}

export interface DispatchMasterFixOptions {
  runId: string;
  runUrl: string;
  repo: string;
  checks: 'ci' | 'e2e';
  /** Branch name prefix, e.g., "fix/master-ci" or "fix/master-e2e" */
  branchPrefix: string;
  /** Extra context appended to fix_context */
  extraContext?: string;
}

/**
 * Dispatch verify-and-fix for a master push failure.
 *
 * 1. Creates a timestamped fix branch from master
 * 2. Pushes it to origin
 * 3. Dispatches verify-and-fix with create_pr=true
 *
 * Returns the created branch name.
 */
export async function dispatchMasterFix(
  github: GitHubClient,
  opts: DispatchMasterFixOptions
): Promise<{ branch: string; failedItems: string }> {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const branch = `${opts.branchPrefix}-${timestamp}`;

  const itemMode = opts.checks === 'e2e' ? 'jobs' : 'steps';
  const failedItems = getFailedItems(opts.runId, itemMode);

  exec('git', ['checkout', '-b', branch]);
  exec('git', ['push', '-u', 'origin', branch]);

  const label = opts.checks === 'e2e' ? 'E2E failed' : 'CI failed';
  const fixContext = `${label} on master after merge. Failed ${itemMode}: ${failedItems}. Run: ${opts.runUrl}.`;

  await github.dispatchWorkflow('verify-and-fix.yml', 'master', {
    branch,
    checks: opts.checks,
    fix_enabled: 'true',
    max_attempts: '3',
    create_pr: 'true',
    fix_context: opts.extraContext ? `${fixContext} ${opts.extraContext}` : fixContext,
  });

  return { branch, failedItems };
}
