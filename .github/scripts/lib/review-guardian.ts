/**
 * Review Guardian — auto-approve and review decision logic.
 *
 * Extracts inline shell from review-guardian.yml into testable TypeScript.
 *
 * Three decision paths:
 * 1. Bot review (Gemini/Copilot posts COMMENTED review) → approve or defer
 * 2. Claude review (Claude posts comment on PR) → approve or defer
 * 3. Ensure review (CI passes on PR) → request review or approve
 */

import { execFileSync } from 'node:child_process';

function exec(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function safeExec(command: string, args: string[], fallback = ''): string {
  try {
    return exec(command, args);
  } catch {
    return fallback;
  }
}

function pipelineCli(...cliArgs: string[]): string {
  return exec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', ...cliArgs]);
}

function safePipelineCli(fallback: string, ...cliArgs: string[]): string {
  return safeExec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', ...cliArgs], fallback);
}

// ─── Bot review decision (request-approval job) ────────────────────

export type BotReviewAction =
  | { action: 'already-approved' }
  | { action: 'defer-critical'; criticalCount: number; unresolvedCount: number }
  | { action: 'defer-review-fix-active' }
  | { action: 'defer-relay-posted' }
  | { action: 'approve'; reviewer: string };

export function decideBotReviewAction(
  prNum: number,
  reviewer: string,
  repo: string,
): BotReviewAction {
  // Check existing approval
  const approvals = parseInt(safePipelineCli('0', 'count-approvals', String(prNum), repo), 10);
  if (approvals > 0) {
    return { action: 'already-approved' };
  }

  // Check critical/high-severity inline comments
  const criticalCount = parseInt(safePipelineCli('0', 'count-critical-comments', String(prNum), repo), 10);
  if (criticalCount > 0) {
    const unresolvedCount = parseInt(safePipelineCli('0', 'count-unresolved-threads', String(prNum), repo), 10);
    if (unresolvedCount > 0) {
      return { action: 'defer-critical', criticalCount, unresolvedCount };
    }
    // All threads resolved — feedback was addressed, continue to approve
  }

  return { action: 'approve', reviewer };
}

/**
 * Post-wait checks after the 90s delay.
 * Returns whether to proceed with approval or defer.
 */
export function checkPostWaitConditions(
  prNum: number,
  repo: string,
): BotReviewAction {
  // Check if review-fix is active
  try {
    pipelineCli('is-workflow-active', 'review-fix.yml', String(prNum), repo);
    return { action: 'defer-review-fix-active' };
  } catch {
    // Not active — continue
  }

  // Check if review-relay posted a dispatch comment
  const relayPosted = parseInt(
    safeExec('gh', [
      'api', `repos/${repo}/issues/${prNum}/comments`,
      '-q', '[.[] | select(.body | test("Dispatched review-fix workflow|review round"; "i"))] | length',
    ], '0'),
    10,
  );

  if (relayPosted > 0) {
    return { action: 'defer-relay-posted' };
  }

  return { action: 'approve', reviewer: '' };
}

// ─── Claude review decision (auto-approve-after-claude job) ────────

export type ClaudeReviewAction =
  | { action: 'not-review-response' }
  | { action: 'already-approved' }
  | { action: 'has-critical-inline'; count: number }
  | { action: 'has-issues' }
  | { action: 'approve' };

export function decideClaudeReviewAction(
  prNum: number,
  commentBody: string,
  repo: string,
): ClaudeReviewAction {
  // Check if Claude was asked to review
  const reviewRequests = parseInt(
    safeExec('gh', [
      'api', `repos/${repo}/issues/${prNum}/comments`,
      '-q', '[.[] | select(.body | test("perform a comprehensive code review|Please review the diff"))] | length',
    ], '0'),
    10,
  );

  if (reviewRequests === 0) {
    return { action: 'not-review-response' };
  }

  // Check existing approval
  const approvals = parseInt(safePipelineCli('0', 'count-approvals', String(prNum), repo), 10);
  if (approvals > 0) {
    return { action: 'already-approved' };
  }

  // Check critical inline review comments
  const criticalCount = parseInt(safePipelineCli('0', 'count-critical-comments', String(prNum), repo), 10);
  if (criticalCount > 0) {
    return { action: 'has-critical-inline', count: criticalCount };
  }

  // Check Claude's comment for red flags
  if (/request.?changes|critical.?(bug|issue|problem)|do not merge/i.test(commentBody)) {
    return { action: 'has-issues' };
  }

  return { action: 'approve' };
}

// ─── Ensure review decision (ensure-review job) ────────────────────

export type EnsureReviewAction =
  | { action: 'no-pr' }
  | { action: 'already-approved' }
  | { action: 'approve'; reason: string }
  | { action: 'dispatch-auto-merge' }
  | { action: 'dispatch-review-fix' }
  | { action: 'review-fix-active' }
  | { action: 'already-requested' }
  | { action: 'request-review' };

export function decideEnsureReviewAction(
  prNum: number,
  repo: string,
): EnsureReviewAction {
  // Check for APPROVED reviews
  const approvals = parseInt(safePipelineCli('0', 'count-approvals', String(prNum), repo), 10);
  if (approvals > 0) {
    return { action: 'already-approved' };
  }

  // Check for formal PR reviews
  const reviewCount = parseInt(
    safeExec('gh', [
      'pr', 'view', String(prNum), '--repo', repo, '--json', 'reviews',
      '-q', '.reviews | length',
    ], '0'),
    10,
  );

  if (reviewCount > 0) {
    // Formal review exists but no approval
    const unresolved = parseInt(safePipelineCli('0', 'count-unresolved-threads', String(prNum), repo), 10);

    if (unresolved === 0) {
      // All threads resolved — check ALL CI
      const headSha = safeExec('gh', [
        'pr', 'view', String(prNum), '--repo', repo, '--json', 'headRefOid',
        '-q', '.headRefOid',
      ]);

      if (!headSha) {
        return { action: 'no-pr' };
      }

      // Parse CI status
      const ciOutput = safePipelineCli('', 'check-ci-status', headSha, repo);
      const testsPass = ciOutput.includes('TESTS_PASS=true');
      const e2ePass = ciOutput.includes('E2E_PASS=true');

      if (testsPass && e2ePass) {
        return { action: 'approve', reason: 'all review threads resolved after fixes landed and CI passed' };
      } else {
        return { action: 'dispatch-auto-merge' };
      }
    } else {
      // Unresolved threads exist
      try {
        pipelineCli('is-workflow-active', 'review-fix.yml', String(prNum), repo);
        return { action: 'review-fix-active' };
      } catch {
        return { action: 'dispatch-review-fix' };
      }
    }
  }

  // No formal reviews — check if fallback already requested
  const existingRequest = parseInt(
    safeExec('gh', [
      'api', `repos/${repo}/issues/${prNum}/comments`,
      '-q', '[.[] | select(.body | contains("Please perform a comprehensive code review"))] | length',
    ], '0'),
    10,
  );

  if (existingRequest > 0) {
    return { action: 'already-requested' };
  }

  return { action: 'request-review' };
}
