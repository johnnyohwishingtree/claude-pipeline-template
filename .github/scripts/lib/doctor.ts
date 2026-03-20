/**
 * Pipeline Doctor — evidence collection and failure reproduction.
 *
 * Extracts inline shell from pipeline-doctor.yml into testable TypeScript.
 *
 * Sections:
 * 1. Issue context (title, state, labels, body, comments)
 * 2. PR merge readiness (approvals, threads, CI, review-fix runs)
 * 3. Branches & work branch analysis (commit log, diffs)
 * 4. Related PRs
 * 5. Failed workflow runs (auto-discovered + input)
 * 6. Workflow YAML files
 * 7. Previous doctor runs & diagnostic issues
 * 8. Known bug patterns
 * 9. Failure reproduction (typecheck + tests on work branch)
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

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

// ─── Issue context ──────────────────────────────────────────────────

export interface IssueContext {
  title: string;
  state: string;
  labels: string;
  body: string;
  pipelineComments: string;
}

export function getIssueContext(issueNum: number, repo: string): IssueContext {
  const data = safeExec('gh', [
    'issue', 'view', String(issueNum), '--repo', repo,
    '--json', 'title,body,labels,state,comments',
  ], '{}');

  const parsed = JSON.parse(data);
  const title = parsed.title ?? 'unknown';
  const state = parsed.state ?? 'unknown';
  const labels = (parsed.labels ?? []).map((l: { name: string }) => l.name).join(', ') || 'none';
  const body = (parsed.body ?? '').split('\n').slice(0, 50).join('\n');

  // Filter pipeline-related comments
  let pipelineComments = '';
  try {
    const comments = parsed.comments ?? [];
    const filtered = comments.filter((c: { body: string }) =>
      /claude|verify|fix attempt|pipeline|doctor|give.up|timed out|stuck/i.test(c.body ?? '')
    ).slice(-10);
    pipelineComments = filtered.map((c: { author?: { login?: string }; createdAt?: string; body: string }) => {
      const author = c.author?.login ?? 'unknown';
      const date = c.createdAt ?? '?';
      const snippet = (c.body ?? '').split('\n').slice(0, 5).join('\n');
      return `**${author}** (${date}):\n${snippet}`;
    }).join('\n\n');
  } catch {
    pipelineComments = '(no pipeline comments found)';
  }

  return { title, state, labels, body, pipelineComments };
}

// ─── PR merge readiness ────────────────────────────────────────────

export interface PRReadiness {
  prNumber: number;
  approvals: string;
  unresolvedThreads: string;
  ciChecks: string;
  mergeable: string;
  reviewFixRuns: string;
}

export function getRelatedPRNumbers(issueNum: number, repo: string): number[] {
  try {
    const raw = exec('gh', [
      'pr', 'list', '--repo', repo, '--state', 'open',
      '--json', 'number,headRefName,body',
    ]);
    const prs = JSON.parse(raw);
    const pattern = new RegExp(`issue-${issueNum}($|-)`);
    const issueRef = `#${issueNum}`;
    return prs
      .filter((pr: { headRefName: string; body: string }) =>
        pattern.test(pr.headRefName) || (pr.body ?? '').includes(issueRef))
      .map((pr: { number: number }) => pr.number);
  } catch {
    return [];
  }
}

export function getPRReadiness(prNum: number, repo: string): PRReadiness {
  const approvals = safeExec('gh', [
    'pr', 'view', String(prNum), '--repo', repo, '--json', 'reviews',
    '-q', '[.reviews[] | select(.state == "APPROVED")] | length',
  ], '?');

  const [owner, name] = repo.split('/');
  const unresolvedThreads = safeExec('gh', [
    'api', 'graphql', '-f', `query=
      query {
        repository(owner: "${owner}", name: "${name}") {
          pullRequest(number: ${prNum}) {
            reviewThreads(first: 100) {
              nodes { isResolved }
            }
          }
        }
      }
    `,
    '--jq', '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length',
  ], '?');

  const ciChecks = safeExec('gh', [
    'pr', 'view', String(prNum), '--repo', repo, '--json', 'statusCheckRollup',
    '-q', '[.statusCheckRollup[] | "\\(.name): \\(.conclusion // .status)"] | join(", ")',
  ], '?');

  const mergeable = safeExec('gh', [
    'pr', 'view', String(prNum), '--repo', repo,
    '--json', 'mergeable', '-q', '.mergeable',
  ], '?');

  const reviewFixRuns = safeExec('gh', [
    'run', 'list', '--repo', repo, '--workflow', 'review-fix.yml',
    '--json', 'displayTitle,conclusion,createdAt',
    '-q', `[.[] | select(.displayTitle | contains("#${prNum}"))] | .[] | "\\(.conclusion) at \\(.createdAt)"`,
  ], 'none');

  return { prNumber: prNum, approvals, unresolvedThreads, ciChecks, mergeable, reviewFixRuns };
}

// ─── Branches & work branch analysis ───────────────────────────────

export interface BranchInfo {
  name: string;
  sha: string;
  ahead: number;
  date: string;
}

export function getRelatedBranches(issueNum: number, repo: string): BranchInfo[] {
  const branches: BranchInfo[] = [];
  const patterns = [
    `refs/remotes/origin/claude/issue-${issueNum}`,
    `refs/remotes/origin/claude/issue-${issueNum}-*`,
    `refs/remotes/origin/tmp/claude-*`,
  ];

  for (const pattern of patterns) {
    try {
      const raw = exec('git', [
        'for-each-ref', '--format=%(refname:short) %(objectname:short) %(creatordate:relative)',
        pattern,
      ]);
      if (!raw) continue;
      for (const line of raw.split('\n')) {
        const parts = line.split(' ');
        if (parts.length < 3) continue;
        const ref = parts[0];
        const sha = parts[1];
        const date = parts.slice(2).join(' ');
        const name = ref.replace(/^origin\//, '');
        const ahead = parseInt(safeExec('git', ['rev-list', '--count', `origin/master..${ref}`], '0'), 10);
        branches.push({ name, sha, ahead, date });
      }
    } catch {
      // ignore
    }
  }
  return branches;
}

export function findBestWorkBranch(issueNum: number): { branch: string; ahead: number } | null {
  const patterns = [
    `refs/remotes/origin/claude/issue-${issueNum}`,
    `refs/remotes/origin/claude/issue-${issueNum}-*`,
  ];

  let bestBranch = '';
  let bestAhead = 0;

  for (const pattern of patterns) {
    try {
      const refs = exec('git', ['for-each-ref', '--format=%(refname:short)', pattern]);
      if (!refs) continue;
      for (const ref of refs.split('\n')) {
        if (!ref) continue;
        const ahead = parseInt(safeExec('git', ['rev-list', '--count', `origin/master..${ref}`], '0'), 10);
        if (ahead > bestAhead) {
          bestAhead = ahead;
          bestBranch = ref.replace(/^origin\//, '');
        }
      }
    } catch {
      // ignore
    }
  }

  return bestBranch && bestAhead > 0 ? { branch: bestBranch, ahead: bestAhead } : null;
}

export function getWorkBranchAnalysis(branch: string, ahead: number): string {
  const lines: string[] = [];
  lines.push(`## Work Branch Analysis: \`${branch}\``);
  lines.push('');
  lines.push(`This branch has **${ahead} commits** ahead of master. Use this to understand what was intentionally changed.`);
  lines.push('');

  lines.push('### Commit log');
  lines.push('```');
  lines.push(safeExec('git', ['log', '--oneline', `origin/master..origin/${branch}`]).split('\n').slice(0, 30).join('\n'));
  lines.push('```');
  lines.push('');

  lines.push('### Files changed vs master');
  lines.push('```');
  lines.push(safeExec('git', ['diff', '--stat', `origin/master..origin/${branch}`]).split('\n').slice(-40).join('\n'));
  lines.push('```');
  lines.push('');

  lines.push('### Key diffs (per-file, max 50 lines each)');
  lines.push('');
  const changedFiles = safeExec('git', ['diff', '--name-only', `origin/master..origin/${branch}`]);
  for (const file of changedFiles.split('\n')) {
    if (!file) continue;
    const diff = safeExec('git', ['diff', `origin/master..origin/${branch}`, '--', file])
      .split('\n').slice(0, 50).join('\n');
    lines.push(`<details><summary>${file}</summary>`);
    lines.push('');
    lines.push('```diff');
    lines.push(diff);
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Related PRs ───────────────────────────────────────────────────

export function getRelatedPRs(issueNum: number, repo: string): string {
  try {
    const raw = exec('gh', [
      'pr', 'list', '--repo', repo, '--state', 'all',
      '--json', 'number,headRefName,state,title,url',
      '-q', `.[] | select(.headRefName | test("issue-${issueNum}($|-)"))`,
    ]);
    if (!raw) return '(no related PRs found)';
    const prs = raw.split('\n').filter(Boolean).map(line => {
      const pr = JSON.parse(line);
      return `- [#${pr.number}](${pr.url}) (${pr.state}): ${pr.title} [\`${pr.headRefName}\`]`;
    });
    return prs.join('\n') || '(no related PRs found)';
  } catch {
    return '(no related PRs found)';
  }
}

// ─── Failed workflow runs ──────────────────────────────────────────

export function discoverRunIds(issueNum: number, repo: string, inputIds: string): string[] {
  const ids = new Set<string>();

  // From input
  if (inputIds) {
    for (const id of inputIds.split(',')) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }

  // Auto-discover verify-and-fix runs
  try {
    const vfRaw = exec('gh', [
      'run', 'list', '--repo', repo, '--workflow', 'verify-and-fix.yml',
      '--json', 'databaseId,displayTitle,conclusion,status,createdAt',
      '-q', `[.[] | select(.displayTitle | contains("#${issueNum}"))] | sort_by(.createdAt) | last(6) | .[].databaseId`,
    ]);
    for (const id of vfRaw.split('\n')) {
      if (id.trim()) ids.add(id.trim());
    }
  } catch {
    // ignore
  }

  // Auto-discover claude.yml runs
  try {
    const claudeRaw = exec('gh', [
      'run', 'list', '--repo', repo, '--workflow', 'claude.yml',
      '--json', 'databaseId,displayTitle,conclusion',
      '-q', `[.[] | select(.displayTitle | contains("#${issueNum}"))] | last(3) | .[].databaseId`,
    ]);
    for (const id of claudeRaw.split('\n')) {
      if (id.trim()) ids.add(id.trim());
    }
  } catch {
    // ignore
  }

  return Array.from(ids);
}

export interface RunEvidence {
  runId: string;
  name: string;
  title: string;
  conclusion: string;
  createdAt: string;
  failedLog: string;
}

export function getRunEvidence(runId: string, repo: string): RunEvidence {
  const data = safeExec('gh', [
    'run', 'view', runId, '--repo', repo,
    '--json', 'name,displayTitle,conclusion,status,createdAt,updatedAt',
  ], '{}');

  const parsed = JSON.parse(data);
  const failedLog = safeExec('gh', [
    'run', 'view', runId, '--repo', repo, '--log-failed',
  ]);
  const logLines = failedLog ? failedLog.split('\n').slice(-100).join('\n') : '';

  return {
    runId,
    name: parsed.name ?? 'unknown',
    title: parsed.displayTitle ?? 'unknown',
    conclusion: parsed.conclusion ?? parsed.status ?? 'unknown',
    createdAt: parsed.createdAt ?? '?',
    failedLog: logLines,
  };
}

// ─── Previous doctor runs ──────────────────────────────────────────

export function getPreviousDoctorRuns(issueNum: number, repo: string, currentRunId?: string): string {
  const raw = safeExec('gh', [
    'run', 'list', '--repo', repo, '--workflow', 'pipeline-doctor.yml',
    '--json', 'databaseId,displayTitle,conclusion,createdAt',
    '-q', `[.[] | select(.displayTitle | contains("#${issueNum}"))] | sort_by(.createdAt) | .[]`,
  ]);

  if (!raw) return 'No previous doctor runs found for this issue — this is the first diagnosis.';

  const lines: string[] = [
    'Previous doctor runs found for this issue. If this is a repeat diagnosis, you MUST try a DIFFERENT approach.',
    '',
  ];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const run = JSON.parse(line);
      lines.push(`- Run ${run.databaseId} (${run.conclusion ?? 'unknown'}): ${run.createdAt}`);
    } catch {
      // ignore
    }
  }

  // Fetch logs from the most recent previous doctor run (excluding current)
  try {
    const runs = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const prev = runs.filter(r => String(r.databaseId) !== String(currentRunId)).pop();
    if (prev) {
      const prevLog = safeExec('gh', [
        'run', 'view', String(prev.databaseId), '--repo', repo, '--log',
      ]);
      if (prevLog) {
        const logTail = prevLog.split('\n').slice(-150).join('\n');
        lines.push('');
        lines.push(`### Previous doctor run logs (run ${prev.databaseId})`);
        lines.push(`<details><summary>Last 150 lines of previous doctor run</summary>`);
        lines.push('');
        lines.push('```');
        lines.push(logTail);
        lines.push('```');
        lines.push('</details>');
      }
    }
  } catch {
    // ignore
  }

  return lines.join('\n');
}

export function getPreviousDiagnosticIssues(repo: string): string {
  return safeExec('gh', [
    'issue', 'list', '--repo', repo, '--label', 'pipeline-diagnosis', '--state', 'all',
    '--json', 'number,title,state,url',
    '-q', '.[] | "- [\\(.title)](\\(.url)) (\\(.state))"',
  ], '(none)');
}

// ─── Known bug patterns ────────────────────────────────────────────

// ─── Pipeline flow diagnosis ──────────────────────────────────────

export interface FlowDiagnosis {
  prNumber: number;
  stuckReason: string;
  flowPath: string[];
  action: 'dispatch-auto-merge' | 'dispatch-ci' | 'resolve-conflicts' | 'dispatch-review-fix' | 'needs-code-fix' | 'unknown';
  detail: string;
}

/**
 * Diagnose WHY a PR is stuck by tracing the pipeline flow.
 *
 * This does what a human would do: check each gate condition, trace
 * which workflow should have fired, and identify the gap.
 */
export function diagnosePipelineFlow(prNum: number, repo: string): FlowDiagnosis {
  const path: string[] = [];

  // Step 1: Check merge state
  const mergeable = safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'mergeable', '-q', '.mergeable'], 'UNKNOWN');
  path.push(`mergeable: ${mergeable}`);

  if (mergeable === 'CONFLICTING') {
    return {
      prNumber: prNum, stuckReason: 'Merge conflict with master',
      flowPath: path, action: 'resolve-conflicts',
      detail: 'PR has merge conflicts. Dispatching resolve-conflicts.yml.',
    };
  }

  // Step 2: Check CI status
  const ciRaw = safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'statusCheckRollup',
    '-q', '[.statusCheckRollup[] | select(.name == "test" or .name == "test-chromium" or .name == "typecheck" or .name == "bundle-ios" or .name == "bundle-android") | {name: .name, conclusion: (.conclusion // "pending")}]'], '[]');

  let checks: Array<{ name: string; conclusion: string }> = [];
  try { checks = JSON.parse(ciRaw); } catch { /* empty */ }
  path.push(`ci checks: ${checks.map(c => `${c.name}=${c.conclusion}`).join(', ') || 'none'}`);

  const hasFailure = checks.some(c => c.conclusion === 'FAILURE' || c.conclusion === 'failure');
  const hasPending = checks.some(c => c.conclusion === 'pending' || c.conclusion === '');
  const allPassed = checks.length > 0 && checks.every(c => c.conclusion === 'SUCCESS' || c.conclusion === 'success');

  if (checks.length === 0) {
    return {
      prNumber: prNum, stuckReason: 'No CI checks found',
      flowPath: path, action: 'dispatch-ci',
      detail: 'No CI checks registered on the PR. GitHub pull_request events may not have fired. Dispatching CI explicitly.',
    };
  }

  if (hasFailure) {
    const failed = checks.filter(c => c.conclusion === 'FAILURE').map(c => c.name);
    return {
      prNumber: prNum, stuckReason: `CI failing: ${failed.join(', ')}`,
      flowPath: path, action: 'needs-code-fix',
      detail: `CI checks failing: ${failed.join(', ')}. verify-and-fix should handle this. If it already ran, check if it produced changes.`,
    };
  }

  if (hasPending) {
    return {
      prNumber: prNum, stuckReason: 'CI still pending',
      flowPath: path, action: 'dispatch-ci',
      detail: 'Some CI checks are still pending or were never reported. Dispatching CI to fill the gap.',
    };
  }

  // Step 3: CI passed — check approval
  path.push('ci: all passed');

  const approvals = parseInt(safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'reviews', '-q', '[.reviews[] | select(.state == "APPROVED")] | length'], '0'), 10);
  path.push(`approvals: ${approvals}`);

  // Step 4: Check PR author vs repo owner (personal repo self-approval)
  const prAuthor = safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'author', '-q', '.author.login'], '');
  const repoOwner = repo.split('/')[0];
  const isOwnerPR = prAuthor === repoOwner;
  path.push(`author: ${prAuthor}, owner: ${repoOwner}, isOwnerPR: ${isOwnerPR}`);

  // Step 5: Check unresolved threads
  const [owner, name] = repo.split('/');
  const unresolvedRaw = safeExec('gh', ['api', 'graphql', '-f', `query={
    repository(owner: "${owner}", name: "${name}") {
      pullRequest(number: ${prNum}) {
        reviewThreads(first: 100) { nodes { isResolved } }
      }
    }
  }`, '--jq', '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length'], '0');
  const unresolved = parseInt(unresolvedRaw, 10);
  path.push(`unresolved threads: ${unresolved}`);

  if (unresolved > 0) {
    return {
      prNumber: prNum, stuckReason: `${unresolved} unresolved review threads`,
      flowPath: path, action: 'dispatch-review-fix',
      detail: `${unresolved} unresolved review threads. review-fix should resolve them, or watcher should resolve and dispatch auto-merge.`,
    };
  }

  // Step 6: Check branch up-to-date
  const branchName = safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'headRefName', '-q', '.headRefName'], '');
  const comparison = safeExec('gh', ['api', `repos/${repo}/compare/master...${branchName}`,
    '--jq', '.status'], 'unknown');
  path.push(`branch status: ${comparison}`);

  // Step 7: All conditions met — should be merging
  if (allPassed && (approvals > 0 || isOwnerPR) && unresolved === 0) {
    return {
      prNumber: prNum, stuckReason: 'All conditions met but not merging',
      flowPath: path, action: 'dispatch-auto-merge',
      detail: `CI passed, ${isOwnerPR ? 'owner-approved (implicit)' : `${approvals} approvals`}, 0 unresolved threads, branch ${comparison}. Dispatching auto-merge — the merge gate should handle update_branch if needed.`,
    };
  }

  // Fallback
  return {
    prNumber: prNum, stuckReason: 'Unknown pipeline state',
    flowPath: path, action: 'unknown',
    detail: `Could not determine why PR is stuck. Flow path: ${path.join(' → ')}`,
  };
}

/**
 * Act on a diagnosis — dispatch the appropriate workflow.
 */
export async function actOnDiagnosis(
  diagnosis: FlowDiagnosis,
  github: import('./github.js').GitHubClient,
  repo: string,
): Promise<string> {
  const prNum = diagnosis.prNumber;
  const branchName = safeExec('gh', ['pr', 'view', String(prNum), '--repo', repo,
    '--json', 'headRefName', '-q', '.headRefName'], '');

  switch (diagnosis.action) {
    case 'dispatch-auto-merge':
      await github.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(prNum) });
      return `Dispatched auto-merge for PR #${prNum}`;

    case 'dispatch-ci':
      await github.dispatchWorkflow('test.yml', branchName);
      await github.dispatchWorkflow('e2e-smoke.yml', branchName);
      return `Dispatched test.yml + e2e-smoke.yml for PR #${prNum}`;

    case 'resolve-conflicts':
      await github.dispatchWorkflow('resolve-conflicts.yml', 'master', { pr_number: String(prNum) });
      return `Dispatched resolve-conflicts for PR #${prNum}`;

    case 'dispatch-review-fix':
      exec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'resolve-all-threads', String(prNum), repo]);
      await github.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(prNum) });
      return `Resolved threads and dispatched auto-merge for PR #${prNum}`;

    case 'needs-code-fix':
      return `PR #${prNum} has failing CI — verify-and-fix should handle this`;

    default:
      return `PR #${prNum}: unknown state, no action taken`;
  }
}

export const KNOWN_BUG_PATTERNS = `These are patterns from previous pipeline bugs. Check if the current failure matches any:

1. **Missing allowedTools**: Claude's fix job couldn't run git commands (fetch, merge, checkout, rebase) because they weren't in allowedTools. Symptom: "Claude produced no changes" across all attempts.
2. **Merge conflict + no git tools**: verify-and-fix detects conflict, tells Claude to resolve, but Claude can't run \`git fetch\`/\`git merge\`.
3. **Watcher can't detect active runs**: \`gh api .inputs.issue_number\` returns null for workflow_dispatch runs. Must parse displayTitle instead.
4. **Snapshot files in CI**: \`jest --ci\` won't auto-create .snap files. Tests with \`toMatchSnapshot()\` always fail in CI.
5. **Silent failures from || true**: \`git pull --rebase ... 2>/dev/null || true\` swallows real errors, making pushes silently fail.
6. **Duplicate chains**: Watcher retriggers stories that already have active verify-and-fix runs because it can't detect them.
7. **Native deps on Ubuntu**: \`pod install\` can't run on Ubuntu CI. Native packages need lazy/optional imports.
8. **Stale test assertions after intentional code changes**: Code was changed on purpose (e.g., fixing a URL, renaming a field) but existing tests still assert the OLD value. The fix job sees "expected A, got B" but can't tell if the code or test is wrong without knowing the commit intent. Fix: update the test assertions to match the new code. This is the #1 cause of "Claude produced no changes" across all fix attempts.
9. **PR stuck on approval — unresolved review threads**: review-fix addressed feedback but ran with an older workflow version that lacked the "resolve review threads" step. Threads stay unresolved → review-guardian sees ![high]/![critical] badges + unresolved threads → blocks approval → auto-merge can't merge. Fix: resolve all review threads via GraphQL mutation, then close/reopen the PR to retrigger review-guardian.
10. **Workflow version mismatch**: \`workflow_run\`-triggered workflows run from the default branch, but \`workflow_dispatch\`-triggered workflows (like review-fix) run from the ref they were dispatched on. If a fix was added to master but review-fix was dispatched before the merge, it uses the old code. This is a GitHub Actions fundamental — cannot be fixed, only mitigated by safety nets (watcher, doctor).`;

// ─── Workflow YAML inclusion ───────────────────────────────────────

export function getWorkflowYAMLs(workflowDir: string, names: string[]): string {
  const lines: string[] = [];
  for (const wf of names) {
    const path = `${workflowDir}/${wf}`;
    try {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path, 'utf-8');
        lines.push(`<details><summary>${wf}</summary>`);
        lines.push('');
        lines.push('```yaml');
        lines.push(content);
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }
    } catch {
      // ignore
    }
  }
  return lines.join('\n');
}

// ─── Failure reproduction ──────────────────────────────────────────

export interface ReproductionResult {
  typecheckOutput: string;
  testFailures: string;
  failingTestFiles: string[];
  mergeConflict: boolean;
}

export function reproduceFailures(workBranch: string): ReproductionResult {
  let mergeConflict = false;

  // Checkout work branch
  safeExec('git', ['checkout', `origin/${workBranch}`, '--detach']);

  // Try merging master
  try {
    exec('git', ['merge', 'origin/master', '--no-edit']);
  } catch {
    mergeConflict = true;
    safeExec('git', ['merge', '--abort']);
  }

  // Install deps
  safeExec('pnpm', ['install', '--frozen-lockfile']);

  // Typecheck
  let typecheckOutput = '';
  try {
    exec('pnpm', ['typecheck']);
    typecheckOutput = '(typecheck passed)';
  } catch (e: unknown) {
    const stderr = (e as { stderr?: Buffer })?.stderr?.toString() ?? '';
    const stdout = (e as { stdout?: Buffer })?.stdout?.toString() ?? '';
    const combined = stdout + '\n' + stderr;
    typecheckOutput = combined.split('\n')
      .filter(l => /error TS|Found/.test(l))
      .slice(0, 30)
      .join('\n') || '(typecheck failed but no TS errors found in output)';
  }

  // Tests
  let testFailures = '';
  const failingTestFiles: string[] = [];
  try {
    exec('pnpm', ['test']);
    testFailures = '(tests passed)';
  } catch (e: unknown) {
    const stdout = (e as { stdout?: Buffer })?.stdout?.toString() ?? '';
    testFailures = stdout.split('\n')
      .filter(l => /FAIL |● |Expected|Received|expect\(|toBe\(|at Object|\.test\./.test(l))
      .filter(l => !/● Console/.test(l))
      .slice(0, 60)
      .join('\n') || '(tests failed but no matching output found)';

    // Extract failing test file paths
    const failLines = stdout.split('\n').filter(l => /^FAIL /.test(l));
    for (const line of failLines.slice(0, 10)) {
      const path = line.replace(/^FAIL\s+/, '').trim();
      if (path) failingTestFiles.push(path);
    }
  }

  // Switch back to master
  safeExec('git', ['checkout', 'master']);

  return { typecheckOutput, testFailures, failingTestFiles, mergeConflict };
}

// ─── Full evidence collection ──────────────────────────────────────

export interface CollectEvidenceOptions {
  issueNum: number;
  repo: string;
  failedRunIds: string;
  workflowDir: string;
  currentRunId?: string;
}

export function collectEvidence(opts: CollectEvidenceOptions): { evidence: string; workBranch: string | null } {
  const lines: string[] = [];
  const { issueNum, repo, failedRunIds, workflowDir, currentRunId } = opts;

  // 1. Issue context
  const issue = getIssueContext(issueNum, repo);
  lines.push(`## Issue #${issueNum}`);
  lines.push('');
  lines.push(`**Link:** https://github.com/${repo}/issues/${issueNum}`);
  lines.push(`**Title:** ${issue.title}`);
  lines.push(`**State:** ${issue.state}`);
  lines.push(`**Labels:** ${issue.labels}`);
  lines.push('');
  lines.push('<details><summary>Issue body (first 50 lines)</summary>');
  lines.push('');
  lines.push('```');
  lines.push(issue.body);
  lines.push('```');
  lines.push('</details>');
  lines.push('');
  lines.push('### Recent pipeline comments');
  lines.push('');
  lines.push(issue.pipelineComments || '(no pipeline comments found)');
  lines.push('');

  // 2. PR merge readiness
  lines.push('## PR Merge Readiness');
  lines.push('');
  const prNumbers = getRelatedPRNumbers(issueNum, repo);
  for (const prNum of prNumbers) {
    const readiness = getPRReadiness(prNum, repo);
    lines.push(`### PR #${prNum}`);
    lines.push(`- **Approvals:** ${readiness.approvals}`);
    lines.push(`- **Unresolved review threads:** ${readiness.unresolvedThreads}`);
    lines.push(`- **CI checks:** ${readiness.ciChecks}`);
    lines.push(`- **Mergeable:** ${readiness.mergeable}`);
    lines.push(`- **Review-fix runs:** ${readiness.reviewFixRuns}`);
    lines.push('');
  }

  // 3. Branches
  lines.push('## Branches');
  lines.push('');
  const branches = getRelatedBranches(issueNum, repo);
  for (const b of branches) {
    lines.push(`- [\`${b.name}\`](https://github.com/${repo}/tree/${b.name}) — ${b.sha}, ${b.ahead} commits ahead, ${b.date}`);
  }
  lines.push('');

  // Work branch analysis
  const best = findBestWorkBranch(issueNum);
  let workBranch: string | null = null;
  if (best) {
    workBranch = best.branch;
    lines.push(getWorkBranchAnalysis(best.branch, best.ahead));
  } else {
    lines.push('## Work Branch Analysis');
    lines.push('');
    lines.push('No work branch found with commits ahead of master.');
    lines.push('');
  }

  // 4. Related PRs
  lines.push('## Related PRs');
  lines.push('');
  lines.push(getRelatedPRs(issueNum, repo));
  lines.push('');

  // 5. Failed workflow runs
  lines.push('## Failed Workflow Runs');
  lines.push('');
  const runIds = discoverRunIds(issueNum, repo, failedRunIds);
  for (const runId of runIds) {
    const evidence = getRunEvidence(runId, repo);
    const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
    lines.push(`### [${evidence.name}: ${evidence.title}](${runUrl})`);
    lines.push(`- **Conclusion:** ${evidence.conclusion}`);
    lines.push(`- **Created:** ${evidence.createdAt}`);
    lines.push('');
    if (evidence.failedLog) {
      lines.push('<details><summary>Failed logs (last 100 lines)</summary>');
      lines.push('');
      lines.push('```');
      lines.push(evidence.failedLog);
      lines.push('```');
      lines.push('</details>');
    } else {
      lines.push('_No failed logs (run may have succeeded or logs expired)_');
    }
    lines.push('');
  }

  // 6. Workflow YAML files
  lines.push('## Pipeline Workflow Files');
  lines.push('');
  lines.push('These are the current workflow files on master. The doctor should check if any of these have bugs causing the failures.');
  lines.push('');
  lines.push(getWorkflowYAMLs(workflowDir, ['verify-and-fix.yml', 'claude.yml', 'watcher.yml']));

  // 7. Previous doctor runs
  lines.push('## Previous Doctor Runs');
  lines.push('');
  lines.push(getPreviousDoctorRuns(issueNum, repo, currentRunId));
  lines.push('');

  // 8. Previous diagnostic issues
  lines.push('## Previous Diagnostic Issues');
  lines.push('');
  lines.push(getPreviousDiagnosticIssues(repo));
  lines.push('');

  // 9. Known bug patterns
  lines.push('## Known Pipeline Bug Patterns');
  lines.push('');
  lines.push(KNOWN_BUG_PATTERNS);
  lines.push('');

  return { evidence: lines.join('\n'), workBranch };
}
