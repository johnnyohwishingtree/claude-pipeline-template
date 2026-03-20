/**
 * Pipeline Watcher — extracts inline shell logic from watcher.yml.
 *
 * The watcher runs every 20 minutes and:
 * 1. Counts active Claude workflows and available slots
 * 2. Checks open claude/ PRs for merge conflicts, CI failures, stuck merges
 * 3. Checks in-progress stories and retriggers if stuck
 * 4. Checks stalled epics and triggers next pending story
 * 5. Closes orphan claude/ PRs with no linked story
 */

import { execFileSync } from 'node:child_process';
import { GitHubClient } from './github.js';

function exec(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function execOrDefault(command: string, args: string[], defaultVal: string): string {
  try {
    return exec(command, args) || defaultVal;
  } catch {
    return defaultVal;
  }
}

/** Minutes since an ISO timestamp. */
export function minutesAgo(isoTimestamp: string): number {
  const then = new Date(isoTimestamp).getTime();
  if (isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 60000);
}

/** Extract issue number from a workflow display title like "Claude #42 by user" or "Verify #42 on branch". */
export function extractIssueFromTitle(title: string): number | null {
  const match = title.match(/#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Extract issue number from a branch name like "claude/issue-42-20260319-1234". */
export function extractIssueFromBranch(branch: string): number | null {
  const match = branch.match(/issue-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Extract issue number from PR body "Closes #N" / "Fixes #N" / "Resolves #N". */
export function extractLinkedIssue(body: string): number | null {
  const match = body.match(/(?:Closes|Fixes|Resolves)\s+#(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ─── Section 1: Active workflow counting ───────────────────────────

export interface WorkflowSlots {
  activeRuns: number;
  queuedRuns: number;
  totalActive: number;
  slotsAvailable: number;
  /** Issue numbers with active claude.yml or verify-and-fix.yml runs */
  busyIssues: Set<number>;
}

export function getWorkflowSlots(repo: string, maxConcurrent: number): WorkflowSlots {
  const activeRuns = parseInt(
    execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'claude.yml',
      '--status', 'in_progress', '--json', 'databaseId', '-q', 'length'], '0'), 10);
  const queuedRuns = parseInt(
    execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'claude.yml',
      '--status', 'queued', '--json', 'databaseId', '-q', 'length'], '0'), 10);
  const totalActive = activeRuns + queuedRuns;

  const busyIssues = new Set<number>();

  // Collect issues from active/queued claude.yml and verify-and-fix.yml runs
  for (const workflow of ['claude.yml', 'verify-and-fix.yml']) {
    for (const status of ['in_progress', 'queued']) {
      const titles = execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', workflow,
        '--status', status, '--json', 'displayTitle', '-q', '.[].displayTitle'], '');
      for (const title of titles.split('\n').filter(Boolean)) {
        const issue = extractIssueFromTitle(title);
        if (issue) busyIssues.add(issue);
      }
    }
  }

  return {
    activeRuns,
    queuedRuns,
    totalActive,
    slotsAvailable: Math.max(0, maxConcurrent - totalActive),
    busyIssues,
  };
}

// ─── Section 2: PR health checks ──────────────────────────────────

export interface PRInfo {
  number: number;
  branch: string;
  createdAt: string;
}

export function getOpenClaudePRs(repo: string): PRInfo[] {
  const raw = execOrDefault('gh', ['pr', 'list', '--repo', repo, '--state', 'open',
    '--json', 'number,headRefName,createdAt',
    '-q', '[.[] | select(.headRefName | startswith("claude/"))]'], '[]');
  try {
    return JSON.parse(raw).map((r: { number: number; headRefName: string; createdAt: string }) => ({
      number: r.number,
      branch: r.headRefName,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

/** Returns ALL open PRs (not just claude/ branches). */
export function getOpenPRs(repo: string): PRInfo[] {
  const raw = execOrDefault('gh', ['pr', 'list', '--repo', repo, '--state', 'open',
    '--json', 'number,headRefName,createdAt'], '[]');
  try {
    return JSON.parse(raw).map((r: { number: number; headRefName: string; createdAt: string }) => ({
      number: r.number,
      branch: r.headRefName,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

export function getPRMergeability(pr: number, repo: string): string {
  return execOrDefault('gh', ['pr', 'view', String(pr), '--repo', repo,
    '--json', 'mergeable', '-q', '.mergeable'], 'UNKNOWN');
}

export function getPRCIConclusion(pr: number, repo: string): string {
  // Check ALL required CI checks (test + E2E test-chromium), not just "test".
  // If any required check failed, return FAILURE.
  const raw = execOrDefault('gh', ['pr', 'view', String(pr), '--repo', repo,
    '--json', 'statusCheckRollup',
    '-q', '[.statusCheckRollup[] | select(.name == "test" or .name == "test-chromium") | {name: .name, conclusion: .conclusion}]'], '[]');
  try {
    const checks = JSON.parse(raw) as Array<{ name: string; conclusion: string }>;
    if (checks.length === 0) return '';
    if (checks.some(c => c.conclusion === 'FAILURE')) return 'FAILURE';
    // Only return SUCCESS when both required checks are present and succeeded.
    // If one hasn't started yet it won't appear in the list — don't prematurely
    // declare success based only on the checks that have run so far.
    const requiredChecks = ['test', 'test-chromium'];
    const allPresent = requiredChecks.every(name => checks.some(c => c.name === name));
    if (!allPresent) return '';
    return checks.every(c => c.conclusion === 'SUCCESS') ? 'SUCCESS' : '';
  } catch {
    return '';
  }
}

/** Returns list of file paths changed by a PR. */
export function getPRChangedPaths(pr: number, repo: string): string[] {
  const raw = execOrDefault('gh', ['pr', 'diff', String(pr), '--repo', repo, '--name-only'], '');
  return raw.split('\n').filter(Boolean);
}

/** Returns true if the PR only changes pipeline files (.github/). */
export function isPipelineOnlyPR(pr: number, repo: string): boolean {
  const paths = getPRChangedPaths(pr, repo);
  return paths.length > 0 && paths.every(p => p.startsWith('.github/'));
}

export function getLastCommitTime(pr: number, repo: string): string {
  return execOrDefault('gh', ['api', `repos/${repo}/pulls/${pr}/commits`,
    '-q', '.[-1].commit.author.date'], '');
}

export function getEpicLabel(issue: number, repo: string): string {
  return execOrDefault('gh', ['issue', 'view', String(issue), '--repo', repo,
    '--json', 'labels',
    '-q', '[.labels[].name | select(startswith("epic:"))] | .[0]'], '');
}

export function countCommentsByContent(pr: number, repo: string, bodyContains: string): number {
  const jqFilter = `[.comments[] | select(.body | contains("${bodyContains}"))] | length`;
  return parseInt(
    execOrDefault('gh', ['pr', 'view', String(pr), '--repo', repo,
      '--json', 'comments', '-q', jqFilter], '0'), 10);
}

export function getLatestRunId(repo: string, branch: string, workflow: string): string {
  return execOrDefault('gh', ['run', 'list', '--repo', repo, '--branch', branch,
    '--workflow', workflow, '--limit', '1',
    '--json', 'databaseId', '-q', '.[0].databaseId'], '');
}

export function getLatestFailedRunId(repo: string, branch: string, workflow: string): string {
  return execOrDefault('gh', ['run', 'list', '--repo', repo, '--branch', branch,
    '--workflow', workflow, '--limit', '1',
    '--json', 'databaseId,conclusion',
    '-q', '[.[] | select(.conclusion == "failure")] | .[0].databaseId'], '');
}

export function closeAndReopenPR(pr: number, repo: string): void {
  try { exec('gh', ['pr', 'close', String(pr), '--repo', repo]); } catch { /* ignore */ }
  try { exec('gh', ['pr', 'reopen', String(pr), '--repo', repo]); } catch { /* ignore */ }
}

export interface PRCheckResult {
  action: 'none' | 'conflict' | 'retrigger-ci' | 'fix-ci' | 'dispatch-merge' | 'escalate-merge' | 'resolve-threads' | 'escalate-threads';
  detail: string;
}

export async function checkPR(
  github: GitHubClient,
  pr: PRInfo,
  repo: string,
  graceMinutes: number,
  maxRetries: number,
): Promise<PRCheckResult> {
  // Check merge conflicts — dispatch resolve-conflicts.yml directly
  // (not @claude comment, which relies on a broken workflow trigger)
  const mergeable = getPRMergeability(pr.number, repo);
  if (mergeable === 'CONFLICTING') {
    await github.dispatchWorkflow('resolve-conflicts.yml', 'master', {
      pr_number: String(pr.number),
    });
    return { action: 'conflict', detail: 'Merge conflict — dispatched resolve-conflicts.yml' };
  }

  // Check CI status
  const ciConclusion = getPRCIConclusion(pr.number, repo);
  const lastCommitTime = getLastCommitTime(pr.number, repo);
  const commitAgo = lastCommitTime ? minutesAgo(lastCommitTime) : 0;

  // Missing CI — dispatch both test.yml and e2e-smoke.yml
  if (!ciConclusion || ciConclusion === 'null') {
    if (commitAgo >= graceMinutes) {
      await github.dispatchWorkflow('test.yml', pr.branch);
      await github.dispatchWorkflow('e2e-smoke.yml', pr.branch);
      return { action: 'retrigger-ci', detail: `No CI check, ${commitAgo}m stale — dispatched test + e2e-smoke` };
    }
    return { action: 'none', detail: `No CI check, ${commitAgo}m ago — within grace period` };
  }

  // Failing CI
  if (ciConclusion === 'FAILURE') {
    if (commitAgo >= graceMinutes) {
      const fixCount = countCommentsByContent(pr.number, repo, 'failing');
      if (fixCount < maxRetries) {
        const runId = getLatestRunId(repo, pr.branch, 'test.yml');
        const e2eRunId = getLatestFailedRunId(repo, pr.branch, 'e2e-smoke.yml');

        let runUrls = '';
        if (runId) runUrls += `- Tests: https://github.com/${repo}/actions/runs/${runId} — use \`gh run view ${runId} --log-failed\` to see errors\n`;
        if (e2eRunId) runUrls += `- E2E: https://github.com/${repo}/actions/runs/${e2eRunId} — use \`gh run view ${e2eRunId} --log-failed\` to see errors\n`;

        const body = `@claude CI is still failing on this PR and no new commits in ${commitAgo}m.

**Failed runs:**
${runUrls}
Use \`gh run view <run_id> --log-failed\` to see the full error output from failed steps. Diagnose the root cause and fix all failures.

IMPORTANT: After fixing, run \`pnpm typecheck\`, \`pnpm test\`, and \`pnpm e2e\` locally to verify ALL checks pass BEFORE committing. Then git add, git commit, and git push. (Watcher fix attempt ${fixCount + 1}/${maxRetries})`;

        await github.commentOnIssue(pr.number, body);
        return { action: 'fix-ci', detail: `CI failing, attempt ${fixCount + 1}/${maxRetries}` };
      }
      return { action: 'none', detail: `CI failing, ${fixCount} attempts exhausted — needs human review` };
    }
    return { action: 'none', detail: `CI failing, ${commitAgo}m ago — within grace period` };
  }

  // CI passing — check for stuck merge/approval
  if (ciConclusion === 'SUCCESS' || ciConclusion === 'success') {
    const approvals = parseInt(
      execOrDefault('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'count-approvals', String(pr.number), repo], '0'), 10);

    if (approvals > 0 && commitAgo >= graceMinutes) {
      const dispatchAttempts = countCommentsByContent(pr.number, repo, 'Watcher: dispatched auto-merge');
      const maxDispatch = 3;

      if (dispatchAttempts >= maxDispatch) {
        const issueNum = extractIssueFromBranch(pr.branch);
        if (issueNum) {
          try {
            const active = execFileSync('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'is-workflow-active', 'pipeline-doctor.yml', String(issueNum), repo],
              { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
          } catch {
            // is-workflow-active exits 1 when not active
            await github.dispatchWorkflow('pipeline-doctor.yml', 'master', {
              issue_number: String(issueNum),
              trigger_source: 'watcher-stuck-merge',
            });
          }
        }
        return { action: 'escalate-merge', detail: `Dispatched auto-merge ${dispatchAttempts} times — escalating to doctor` };
      }

      await github.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(pr.number) });
      await github.commentOnIssue(pr.number, `Watcher: dispatched auto-merge (attempt ${dispatchAttempts + 1}/${maxDispatch})`);
      return { action: 'dispatch-merge', detail: `Auto-merge dispatched (attempt ${dispatchAttempts + 1}/${maxDispatch})` };
    }

    if (approvals === 0 && commitAgo >= graceMinutes) {
      const unresolved = parseInt(
        execOrDefault('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'count-unresolved-threads', String(pr.number), repo], '0'), 10);

      if (unresolved > 0) {
        const watcherAttempts = countCommentsByContent(pr.number, repo, 'Pipeline watcher: resolved');

        if (watcherAttempts >= 2) {
          const issueNum = extractIssueFromBranch(pr.branch);
          if (issueNum) {
            await github.dispatchWorkflow('pipeline-doctor.yml', 'master', {
              issue_number: String(issueNum),
              trigger_source: 'watcher-stuck-approval',
            });
          }
          return { action: 'escalate-threads', detail: `Resolved threads ${watcherAttempts} times — escalating to doctor` };
        }

        // Resolve threads and dispatch auto-merge to re-evaluate
        exec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'resolve-all-threads', String(pr.number), repo]);
        await github.commentOnIssue(pr.number, `Pipeline watcher: resolved ${unresolved} stale review threads. Dispatching auto-merge to re-evaluate.`);
        await github.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(pr.number) });
        return { action: 'resolve-threads', detail: `Resolved ${unresolved} threads, dispatched auto-merge` };
      }

      // No approvals, no unresolved threads, CI passing — dispatch auto-merge.
      // The merge gate handles owner-approval for personal repos (no formal
      // GitHub approval possible when GITHUB_TOKEN = repo owner).
      const dispatchAttempts = countCommentsByContent(pr.number, repo, 'Watcher: dispatched auto-merge');
      if (dispatchAttempts < 3) {
        await github.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(pr.number) });
        await github.commentOnIssue(pr.number, `Watcher: dispatched auto-merge (attempt ${dispatchAttempts + 1}/3) — CI passed, no unresolved threads.`);
        return { action: 'dispatch-merge', detail: `Auto-merge dispatched (no formal approval, attempt ${dispatchAttempts + 1}/3)` };
      }
    }
  }

  return { action: 'none', detail: `CI: ${ciConclusion}` };
}

// ─── Section 3: Story retrigger ────────────────────────────────────

export function getInProgressStories(repo: string): number[] {
  const raw = execOrDefault('gh', ['issue', 'list', '--repo', repo,
    '--label', 'story', '--label', 'in-progress',
    '--state', 'open', '--json', 'number', '-q', '.[].number'], '');
  return raw.split('\n').filter(Boolean).map(Number).filter(n => !isNaN(n));
}

export function findExistingWorkBranch(issue: number, repo: string): string | null {
  // Check for claude/issue-N-* branches
  const actionBranches = execOrDefault('gh', ['api', `repos/${repo}/git/matching-refs/heads/claude/issue-${issue}-`,
    '--jq', '.[].ref'], '');
  let bestBranch: string | null = null;
  for (const ref of actionBranches.split('\n').filter(Boolean)) {
    bestBranch = ref.replace(/^refs\/heads\//, '');
  }

  // Check for tmp/ branches from verify-and-fix
  const vfData = execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'verify-and-fix.yml',
    '--json', 'displayTitle,conclusion,headBranch',
    '-q', `[.[] | select(.displayTitle | contains("#${issue}"))]`], '[]');
  const vfCount = JSON.parse(vfData).length;

  if (vfCount > 0 && !bestBranch) {
    const tmpBranches = execOrDefault('gh', ['api', `repos/${repo}/git/matching-refs/heads/tmp/`,
      '--jq', '.[].ref'], '');
    for (const ref of tmpBranches.split('\n').filter(Boolean)) {
      bestBranch = ref.replace(/^refs\/heads\//, '');
    }
  }

  return bestBranch;
}

export function countVFGiveups(issue: number, repo: string): number {
  return parseInt(execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'verify-and-fix.yml',
    '--json', 'displayTitle,conclusion',
    '-q', `[.[] | select(.displayTitle | contains("#${issue}")) | select(.displayTitle | contains("attempt 6/6"))] | length`], '0'), 10);
}

export function countSuccessfulClaudeRuns(issue: number, repo: string): number {
  return parseInt(execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'claude.yml',
    '--json', 'displayTitle,conclusion',
    '-q', `[.[] | select(.displayTitle | contains("#${issue} ")) | select(.conclusion == "success")] | length`], '0'), 10);
}

export function isDoctorAlreadyRan(issue: number, repo: string): boolean {
  const count = parseInt(execOrDefault('gh', ['run', 'list', '--repo', repo, '--workflow', 'pipeline-doctor.yml',
    '--json', 'displayTitle,createdAt',
    '-q', `[.[] | select(.displayTitle | contains("#${issue}"))] | length`], '0'), 10);
  return count > 0;
}

export function getLastTriggerTime(issue: number, repo: string): string {
  return execOrDefault('gh', ['issue', 'view', String(issue), '--repo', repo,
    '--json', 'comments',
    '-q', '[.comments[] | select(.body | contains("@claude"))] | last | .createdAt'], '');
}

export function checkExistingPRForBranch(issue: number, repo: string): number | null {
  const prNum = execOrDefault('gh', ['pr', 'list', '--repo', repo,
    '--head', `claude/issue-${issue}`, '--state', 'open',
    '--json', 'number', '-q', '.[0].number'], '');
  if (prNum && prNum !== 'null') return parseInt(prNum, 10);
  return null;
}

// ─── Section 4: Epic staleness ─────────────────────────────────────

export function getOpenEpicLabels(repo: string): string[] {
  const raw = execOrDefault('gh', ['issue', 'list', '--repo', repo,
    '--label', 'epic', '--state', 'open', '--json', 'labels',
    '-q', '[.[].labels[].name | select(startswith("epic:"))] | unique | .[]'], '');
  return raw.split('\n').filter(Boolean);
}

export function hasInProgressStory(repo: string, epicLabel: string): boolean {
  const count = parseInt(execOrDefault('gh', ['issue', 'list', '--repo', repo,
    '--label', 'story', '--label', 'in-progress', '--label', epicLabel,
    '--state', 'open', '--json', 'number', '-q', 'length'], '0'), 10);
  return count > 0;
}

export function countOpenStories(repo: string, epicLabel: string): number {
  return parseInt(execOrDefault('gh', ['issue', 'list', '--repo', repo,
    '--label', 'story', '--label', epicLabel,
    '--state', 'open', '--json', 'number', '-q', 'length'], '0'), 10);
}

export function getEpicNumber(repo: string, epicLabel: string): number | null {
  const raw = execOrDefault('gh', ['issue', 'list', '--repo', repo,
    '--label', 'epic', '--label', epicLabel,
    '--state', 'open', '--json', 'number', '-q', '.[0].number'], '');
  if (raw && raw !== 'null') return parseInt(raw, 10);
  return null;
}

// ─── Section 5: Orphan PR cleanup ──────────────────────────────────

export function getPRBody(pr: number, repo: string): string {
  return execOrDefault('gh', ['pr', 'view', String(pr), '--repo', repo,
    '--json', 'body', '-q', '.body'], '');
}

export function getLastCommentTime(pr: number, repo: string): string {
  return execOrDefault('gh', ['pr', 'view', String(pr), '--repo', repo,
    '--json', 'comments', '-q', '.comments | last | .createdAt'], '');
}

export function closeOrphanPR(pr: number, branch: string, repo: string): void {
  try {
    exec('gh', ['pr', 'close', String(pr), '--repo', repo, '--comment',
      'Closing: this PR has no linked story issue (`Closes #N`) and appears to be orphaned. If this work is still needed, reopen and add a `Closes #N` reference.']);
  } catch { /* ignore */ }
  try {
    exec('gh', ['api', `repos/${repo}/git/refs/heads/${branch}`, '--method', 'DELETE']);
  } catch { /* ignore */ }
}
