#!/usr/bin/env tsx
/**
 * Unified pipeline CLI — replaces all lib.sh functions.
 *
 * Usage:
 *   npx tsx .github/scripts/lib/cli/pipeline.ts <command> [args...]
 *
 * Commands (GitHub API):
 *   comment <issue> <body> [repo]
 *   dispatch <workflow> [--input key=value]...
 *   approve-and-merge <pr> <body> [repo]
 *   get-pr-number <event_name>
 *   count-approvals <pr> [repo]
 *   count-unresolved-threads <pr> [repo]
 *   resolve-all-threads <pr> [repo]
 *   check-ci-status <sha> [repo]
 *   is-workflow-active <workflow> <issue> [repo]
 *   count-critical-comments <pr> [repo]
 *   get-next-pending-story <epic_label> [repo]
 *   trigger-story-agent <issue> [agent] [suffix]
 *
 * Commands (CI Dispatch):
 *   ci-dispatch-pr <pr> <branch> <run_id> <run_url> <checks> [extra_context]
 *   ci-dispatch-master <run_id> <run_url> <checks> <branch_prefix> [extra_context]
 *
 * Commands (Watcher):
 *   watcher-run [max_concurrent] [grace_minutes] [max_retries]
 *
 * Commands (Doctor):
 *   doctor-diagnose <pr>             — diagnose why PR is stuck + auto-fix
 *   doctor-collect-evidence <issue_number> [failed_run_ids]
 *   doctor-reproduce <work_branch>
 *
 * Commands (Review Guardian):
 *   guardian-bot-review <pr> <reviewer>
 *   guardian-post-wait <pr>
 *   guardian-claude-review <pr> <comment_body>
 *   guardian-ensure-review <pr>
 *
 * Commands (Git):
 *   setup-git-auth
 *   merge-master
 *   commit <message> [co-author]
 *   push <branch> [pre-push-head]
 *   update-branch <pr>            — update PR branch + dispatch CI
 *
 * Environment:
 *   GH_PAT / GH_TOKEN      — GitHub token
 *   GITHUB_REPOSITORY       — owner/repo
 */

import { execFileSync } from 'node:child_process';
import { GitHubClient } from '../github.js';
import { setupGitAuth, mergeMasterIntoBranch, checkChangesAndCommit, smartPush } from '../git.js';
import { dispatchPRFix, dispatchMasterFix } from '../ci-dispatch.js';
import * as watcher from '../watcher.js';
import * as doctor from '../doctor.js';
import * as guardian from '../review-guardian.js';

function exec(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function getToken(): string {
  const token = process.env['GH_PAT'] ?? process.env['GH_TOKEN'];
  if (!token) {
    console.error('Error: GH_PAT or GH_TOKEN is required');
    process.exit(1);
  }
  return token;
}

function getRepo(): string {
  const repo = process.env['GITHUB_REPOSITORY'];
  if (!repo) {
    console.error('Error: GITHUB_REPOSITORY is required');
    process.exit(1);
  }
  return repo;
}

function getGitHub(repoOverride?: string): GitHubClient {
  return new GitHubClient({ token: getToken(), repo: repoOverride ?? getRepo() });
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    console.error('Usage: pipeline <command> [args...]');
    process.exit(1);
  }

  switch (command) {
    // ─── GitHub API Commands ──────────────────────────────────────────

    case 'comment': {
      const [issueStr, body, repo] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue) || !body) {
        console.error('Usage: pipeline comment <issue> <body> [repo]');
        process.exit(1);
      }
      const github = getGitHub(repo);
      await github.commentOnIssue(issue, body);
      break;
    }

    case 'dispatch': {
      const workflowFile = args[0];
      if (!workflowFile) {
        console.error('Usage: pipeline dispatch <workflow> [--input key=value]...');
        process.exit(1);
      }
      const inputs: Record<string, string> = {};
      let ref = 'master';
      for (let i = 1; i < args.length; i++) {
        if ((args[i] === '--input' || args[i] === '-f') && args[i + 1]) {
          const [key, ...valParts] = args[i + 1].split('=');
          inputs[key] = valParts.join('=');
          i++;
        } else if (args[i] === '--ref' && args[i + 1]) {
          ref = args[i + 1];
          i++;
        } else {
          console.error(`Unknown or malformed argument: ${args[i]}`);
          process.exit(1);
        }
      }
      const github = getGitHub();
      await github.dispatchWorkflow(workflowFile, ref, Object.keys(inputs).length > 0 ? inputs : undefined);
      break;
    }

    case 'approve-and-merge': {
      const [prStr, body, repo] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr) || !body) {
        console.error('Usage: pipeline approve-and-merge <pr> <body> [repo]');
        process.exit(1);
      }
      const github = getGitHub(repo);
      try {
        await github.approvePR(pr, body);
      } catch (err) {
        if (err instanceof Error && /approve your own pull request/i.test(err.message)) {
          console.log(`Skipping self-approval for PR #${pr} (token owner is the PR author). Auto-merge will still be dispatched.`);
        } else {
          throw err;
        }
      }
      // Dispatch auto-merge since GITHUB_TOKEN approvals don't trigger events
      const pat = process.env['GH_PAT'];
      if (pat) {
        const patGithub = new GitHubClient({ token: pat, repo: repo ?? getRepo() });
        await patGithub.dispatchWorkflow('auto-merge.yml', 'master', { pr_number: String(pr) }).catch(() => {});
      }
      break;
    }

    case 'get-pr-number': {
      const [eventName] = args;
      if (!eventName) {
        console.error('Usage: pipeline get-pr-number <event_name>');
        process.exit(1);
      }
      let prNum = '';
      switch (eventName) {
        case 'workflow_dispatch':
          prNum = process.env['INPUT_PR_NUMBER'] ?? '';
          break;
        case 'workflow_run': {
          const branch = process.env['WORKFLOW_RUN_HEAD_BRANCH'] ?? '';
          if (branch) {
            try {
              const github = getGitHub();
              const prs = await github.listOpenPRs();
              const match = prs.find((p) => p.head.ref === branch);
              if (match) prNum = String(match.number);
            } catch { /* no PR found */ }
          }
          break;
        }
        case 'pull_request':
        case 'pull_request_review':
        case 'issue_comment':
          prNum = process.env['PR_NUMBER_FROM_EVENT'] ?? '';
          break;
      }
      console.log(prNum);
      break;
    }

    case 'count-approvals': {
      const [prStr, repo] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline count-approvals <pr> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      console.log(await github.countApprovals(pr));
      break;
    }

    case 'count-unresolved-threads': {
      const [prStr, repo] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline count-unresolved-threads <pr> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      console.log(await github.countUnresolvedThreads(pr));
      break;
    }

    case 'resolve-all-threads': {
      const [prStr, repo] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline resolve-all-threads <pr> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      const resolved = await github.resolveAllThreads(pr);
      console.log(`Resolved ${resolved} threads`);
      break;
    }

    case 'check-ci-status': {
      const [sha, repo] = args;
      if (!sha) { console.error('Usage: pipeline check-ci-status <sha> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      const status = await github.checkCIStatus(sha);
      // Output in same format as lib.sh for compatibility
      console.log(`TESTS_PASS=${status.testsPass}`);
      console.log(`E2E_PASS=${status.e2ePass}`);
      break;
    }

    case 'is-workflow-active': {
      const [workflow, issueStr, repo] = args;
      const issue = parseInt(issueStr, 10);
      if (!workflow || isNaN(issue)) { console.error('Usage: pipeline is-workflow-active <workflow> <issue> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      const active = await github.isWorkflowActive(workflow, issue);
      process.exit(active ? 0 : 1);
    }

    case 'count-critical-comments': {
      const [prStr, repo] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline count-critical-comments <pr> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      console.log(await github.countCriticalComments(pr));
      break;
    }

    case 'get-next-pending-story': {
      const [epicLabel, repo] = args;
      if (!epicLabel) { console.error('Usage: pipeline get-next-pending-story <epic_label> [repo]'); process.exit(1); }
      const github = getGitHub(repo);
      const next = await github.getNextPendingStory(epicLabel);
      console.log(next ?? '');
      break;
    }

    case 'trigger-story-agent': {
      const [issueStr, agent, suffix] = args;
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue)) { console.error('Usage: pipeline trigger-story-agent <issue> [agent] [suffix]'); process.exit(1); }
      const github = getGitHub();
      await github.triggerStoryAgent(issue, (agent as 'claude' | 'gemini') ?? 'claude', suffix);
      break;
    }

    // ─── CI Dispatch Commands ──────────────────────────────────────────

    case 'ci-dispatch-pr': {
      // Usage: pipeline ci-dispatch-pr <pr> <branch> <run_id> <run_url> <checks> [extra_context]
      const [prStr, branch, runId, runUrl, checks, ...extraParts] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr) || !branch || !runId || !runUrl || !checks) {
        console.error('Usage: pipeline ci-dispatch-pr <pr> <branch> <run_id> <run_url> <checks> [extra_context]');
        process.exit(1);
      }
      if (checks !== 'ci' && checks !== 'e2e') {
        console.error(`Invalid checks value "${checks}": must be "ci" or "e2e"`);
        process.exit(1);
      }
      const github = getGitHub();
      const result = await dispatchPRFix(github, {
        pr,
        branch,
        runId,
        runUrl,
        repo: getRepo(),
        checks: checks as 'ci' | 'e2e',
        extraContext: extraParts.length > 0 ? extraParts.join(' ') : undefined,
      });
      if (result.skipped) {
        console.log('Skipped: PR has no-autofix label');
      } else {
        console.log(`Dispatched verify-and-fix for ${checks} failures: ${result.failedItems}`);
      }
      break;
    }

    case 'ci-dispatch-master': {
      // Usage: pipeline ci-dispatch-master <run_id> <run_url> <checks> <branch_prefix> [extra_context]
      const [runId, runUrl, checks, branchPrefix, ...extraParts] = args;
      if (!runId || !runUrl || !checks || !branchPrefix) {
        console.error('Usage: pipeline ci-dispatch-master <run_id> <run_url> <checks> <branch_prefix> [extra_context]');
        process.exit(1);
      }
      if (checks !== 'ci' && checks !== 'e2e') {
        console.error(`Invalid checks value "${checks}": must be "ci" or "e2e"`);
        process.exit(1);
      }
      const github = getGitHub();
      const result = await dispatchMasterFix(github, {
        runId,
        runUrl,
        repo: getRepo(),
        checks: checks as 'ci' | 'e2e',
        branchPrefix,
        extraContext: extraParts.length > 0 ? extraParts.join(' ') : undefined,
      });
      console.log(`Created branch ${result.branch} and dispatched verify-and-fix: ${result.failedItems}`);
      break;
    }

    // ─── Watcher Commands ────────────────────────────────────────────

    case 'watcher-run': {
      // Usage: pipeline watcher-run [max_concurrent] [grace_minutes] [max_retries]
      const maxConcurrent = parseInt(args[0] ?? '3', 10);
      const graceMinutes = parseInt(args[1] ?? '15', 10);
      const maxRetries = parseInt(args[2] ?? '5', 10);
      const repo = getRepo();
      const github = getGitHub();

      console.log(`=== Pipeline Watcher ${new Date().toISOString()} ===`);

      // 1. Count active workflows
      const slots = watcher.getWorkflowSlots(repo, maxConcurrent);
      console.log(`Claude workflows: ${slots.activeRuns} running, ${slots.queuedRuns} queued (${slots.totalActive} total, limit ${maxConcurrent})`);

      if (slots.totalActive >= maxConcurrent) {
        console.log('At concurrency limit — nothing to do');
        break;
      }
      console.log(`Slots available: ${slots.slotsAvailable}`);

      let slotsAvailable = slots.slotsAvailable;
      const busyEpics = new Set<string>();
      const prIssueNums = new Set<number>();

      // 2. Check ALL open PRs (not just claude/ branches)
      console.log('\n--- Checking open PRs ---');
      const claudePRs = watcher.getOpenPRs(repo);

      for (const pr of claudePRs) {
        console.log(`PR #${pr.number} (${pr.branch}):`);

        const issueNum = watcher.extractIssueFromBranch(pr.branch);
        if (issueNum) {
          prIssueNums.add(issueNum);
          const epicLabel = watcher.getEpicLabel(issueNum, repo);
          if (epicLabel) {
            busyEpics.add(epicLabel);
            console.log(`  Epic: ${epicLabel} (busy)`);
          }
        }

        const result = await watcher.checkPR(github, pr, repo, graceMinutes, maxRetries);
        console.log(`  ${result.detail}`);
      }

      // 3. Check in-progress stories
      console.log('\n--- Checking in-progress stories ---');
      const inProgress = watcher.getInProgressStories(repo);

      for (const issueNum of inProgress) {
        console.log(`Story #${issueNum} is in-progress`);

        if (slotsAvailable <= 0) { console.log('  No slots available — skipping'); continue; }

        const storyEpic = watcher.getEpicLabel(issueNum, repo);
        if (storyEpic && busyEpics.has(storyEpic)) { console.log(`  Epic ${storyEpic} is busy — skipping`); continue; }
        if (slots.busyIssues.has(issueNum)) { console.log('  Active workflow running — skipping'); continue; }
        if (prIssueNums.has(issueNum)) { console.log('  Open PR exists — skipping'); continue; }

        // Check for existing work branch
        const existingBranch = watcher.findExistingWorkBranch(issueNum, repo);
        if (existingBranch) {
          console.log(`  Found existing work: ${existingBranch}`);
          const giveups = watcher.countVFGiveups(issueNum, repo);

          if (giveups >= 2) {
            console.log(`  verify-and-fix gave up ${giveups} times — triggering doctor`);
            let doctorActive = false;
            try { exec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'is-workflow-active', 'pipeline-doctor.yml', String(issueNum), repo]); doctorActive = true; } catch { /* not active */ }
            if (!doctorActive && !watcher.isDoctorAlreadyRan(issueNum, repo)) {
              await github.dispatchWorkflow('pipeline-doctor.yml', 'master', { issue_number: String(issueNum), trigger_source: 'watcher' });
              console.log(`  Triggered pipeline doctor for #${issueNum}`);
            }
          } else {
            const existingPR = watcher.checkExistingPRForBranch(issueNum, repo);
            if (existingPR) {
              console.log(`  PR #${existingPR} already exists — skipping`);
            } else {
              console.log('  Triggering verify-and-fix with existing work');
              await github.dispatchWorkflow('verify-and-fix.yml', 'master', {
                branch: existingBranch,
                merge_into: `claude/issue-${issueNum}`,
                create_pr: 'true',
                issue_number: String(issueNum),
                checks: 'ci',
                fix_enabled: 'true',
                max_attempts: '6',
              });
            }
          }

          if (storyEpic) busyEpics.add(storyEpic);
          slotsAvailable--;
          continue;
        }

        // No existing work — check retry count
        const retryCount = watcher.countSuccessfulClaudeRuns(issueNum, repo);
        console.log(`  Retries: ${retryCount} successful claude.yml runs`);

        if (retryCount >= maxRetries) {
          console.log(`  ${retryCount} attempts — triggering doctor`);
          let doctorActive = false;
          try { exec('npx', ['tsx', '.github/scripts/lib/cli/pipeline.ts', 'is-workflow-active', 'pipeline-doctor.yml', String(issueNum), repo]); doctorActive = true; } catch { /* not active */ }
          if (!doctorActive && !watcher.isDoctorAlreadyRan(issueNum, repo)) {
            await github.dispatchWorkflow('pipeline-doctor.yml', 'master', { issue_number: String(issueNum), trigger_source: 'watcher' });
          }
          continue;
        }

        const lastTrigger = watcher.getLastTriggerTime(issueNum, repo);
        if (lastTrigger) {
          const ago = watcher.minutesAgo(lastTrigger);
          console.log(`  Last trigger: ${ago}m ago`);
          if (ago < graceMinutes) { console.log(`  Within grace period — skipping`); continue; }
        }

        console.log(`  Re-triggering claude.yml (attempt ${retryCount + 1}/${maxRetries})`);
        await github.triggerStoryAgent(issueNum, 'claude', `(Retry #${retryCount + 1} by pipeline watcher)`);
        if (storyEpic) busyEpics.add(storyEpic);
        slotsAvailable--;
      }

      // 4. Check stalled epics
      console.log('\n--- Checking for stalled epics ---');
      const epicLabels = watcher.getOpenEpicLabels(repo);

      for (const epicLabel of epicLabels) {
        console.log(`Epic: ${epicLabel}`);
        if (slotsAvailable <= 0) { console.log('  No slots — skipping'); continue; }
        if (busyEpics.has(epicLabel)) { console.log('  Already busy — skipping'); continue; }

        if (watcher.hasInProgressStory(repo, epicLabel)) { console.log('  Has in-progress story — handled above'); continue; }

        const nextPending = await github.getNextPendingStory(epicLabel);
        if (!nextPending) {
          console.log('  No pending stories — checking if epic is complete');
          if (watcher.countOpenStories(repo, epicLabel) === 0) {
            const epicNum = watcher.getEpicNumber(repo, epicLabel);
            if (epicNum) {
              console.log(`  Closing epic #${epicNum} — all stories complete`);
              await github.commentOnIssue(epicNum, 'All stories in this epic have been completed. (Detected by pipeline watcher)');
              try { exec('gh', ['issue', 'close', String(epicNum), '--repo', repo]); } catch { /* ignore */ }
            }
          }
          continue;
        }

        console.log(`  STALLED — triggering story #${nextPending}`);
        try { exec('gh', ['issue', 'edit', String(nextPending), '--repo', repo, '--remove-label', 'pending', '--add-label', 'in-progress']); } catch { /* ignore */ }
        await github.triggerStoryAgent(nextPending, 'claude', '(Pipeline watcher: orchestrator missed handoff)');
        busyEpics.add(epicLabel);
        slotsAvailable--;
      }

      // 5. Close orphan PRs
      console.log('\n--- Checking for orphan PRs ---');
      for (const pr of claudePRs) {
        const body = watcher.getPRBody(pr.number, repo);
        const linkedIssue = watcher.extractLinkedIssue(body);
        if (linkedIssue) { continue; }

        const prAge = watcher.minutesAgo(pr.createdAt);
        console.log(`PR #${pr.number} has no linked story, age: ${prAge}m`);

        if (prAge < graceMinutes) { console.log('  Too new — skipping'); continue; }

        const lastComment = watcher.getLastCommentTime(pr.number, repo);
        if (lastComment) {
          const commentAgo = watcher.minutesAgo(lastComment);
          if (commentAgo < graceMinutes) { console.log(`  Recent activity (${commentAgo}m) — skipping`); continue; }
        }

        console.log(`  Closing orphan PR #${pr.number}`);
        watcher.closeOrphanPR(pr.number, pr.branch, repo);
      }

      console.log(`\n=== Watcher complete — slots used: ${maxConcurrent - slotsAvailable}/${maxConcurrent} ===`);
      break;
    }

    // ─── Doctor Commands ───────────────────────────────────────────────

    case 'doctor-diagnose': {
      // Diagnose why a PR is stuck and take action to unblock it.
      // Usage: pipeline doctor-diagnose <pr_number>
      const [prStr] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline doctor-diagnose <pr>'); process.exit(1); }

      const diagnosis = doctor.diagnosePipelineFlow(pr, getRepo());
      console.log(`\n=== Pipeline Diagnosis for PR #${pr} ===`);
      console.log(`Stuck reason: ${diagnosis.stuckReason}`);
      console.log(`Flow path: ${diagnosis.flowPath.join(' → ')}`);
      console.log(`Action: ${diagnosis.action}`);
      console.log(`Detail: ${diagnosis.detail}`);

      // Act on the diagnosis
      const github = getGitHub();
      const result = await doctor.actOnDiagnosis(diagnosis, github, getRepo());
      console.log(`\nResult: ${result}`);
      break;
    }

    case 'doctor-collect-evidence': {
      const [issueNumStr, failedRunIds] = args;
      if (!issueNumStr) { console.error('Usage: pipeline doctor-collect-evidence <issue_number> [failed_run_ids]'); process.exit(1); }
      const issueNum = parseInt(issueNumStr, 10);
      const repo = getRepo();
      const workflowDir = '.github/workflows';

      console.log(`=== Pipeline Doctor: collecting evidence for issue #${issueNum} ===`);
      const { evidence, workBranch } = doctor.collectEvidence({
        issueNum,
        repo,
        failedRunIds: failedRunIds ?? '',
        workflowDir,
      });

      const evidenceFile = '/tmp/pipeline-doctor-evidence.md';
      const fs = await import('node:fs');
      fs.writeFileSync(evidenceFile, evidence);
      console.log(`Evidence written to ${evidenceFile} (${evidence.split('\n').length} lines)`);

      // Output for GitHub Actions
      if (process.env['GITHUB_OUTPUT']) {
        fs.appendFileSync(process.env['GITHUB_OUTPUT'], `evidence_file=${evidenceFile}\n`);
      }
      if (workBranch && process.env['GITHUB_ENV']) {
        fs.appendFileSync(process.env['GITHUB_ENV'], `WORK_BRANCH=${workBranch}\n`);
      }
      break;
    }

    case 'doctor-reproduce': {
      const [workBranch] = args;
      if (!workBranch) { console.error('Usage: pipeline doctor-reproduce <work_branch>'); process.exit(1); }

      console.log(`=== Reproducing failures on branch: ${workBranch} ===`);
      const result = doctor.reproduceFailures(workBranch);

      const lines: string[] = [];
      lines.push('## Reproduced Test Failures');
      lines.push('');
      lines.push(`Checked out \`${workBranch}\`, merged master, and ran checks to capture actual error output.`);
      lines.push('');

      if (result.mergeConflict) {
        lines.push('**Merge conflict with master** — this may be the root cause.');
        lines.push('');
      }

      lines.push('### Typecheck output');
      lines.push('```');
      lines.push(result.typecheckOutput);
      lines.push('```');
      lines.push('');
      lines.push('### Test failure details');
      lines.push('```');
      lines.push(result.testFailures);
      lines.push('```');
      lines.push('');

      if (result.failingTestFiles.length > 0) {
        lines.push('### Failing test file contents');
        lines.push('');
        lines.push('These are the test files that fail. Compare their assertions against the commit diffs above.');
        lines.push('');
        const fsModule = await import('node:fs');
        for (const testFile of result.failingTestFiles) {
          try {
            if (fsModule.existsSync(testFile)) {
              const content = fsModule.readFileSync(testFile, 'utf-8');
              lines.push(`<details><summary>${testFile}</summary>`);
              lines.push('');
              lines.push('```typescript');
              lines.push(content);
              lines.push('```');
              lines.push('</details>');
              lines.push('');
            }
          } catch {
            // skip
          }
        }
      }

      // Append to evidence file
      const evidenceFile = '/tmp/pipeline-doctor-evidence.md';
      const fsAppend = await import('node:fs');
      if (fsAppend.existsSync(evidenceFile)) {
        fsAppend.appendFileSync(evidenceFile, '\n' + lines.join('\n'));
        console.log(`Appended reproduction results to ${evidenceFile}`);
      } else {
        fsAppend.writeFileSync(evidenceFile, lines.join('\n'));
        console.log(`Wrote reproduction results to ${evidenceFile}`);
      }
      break;
    }

    // ─── Review Guardian Commands ──────────────────────────────────────

    case 'guardian-bot-review': {
      const [prStr, reviewer] = args;
      if (!prStr || !reviewer) { console.error('Usage: pipeline guardian-bot-review <pr> <reviewer>'); process.exit(1); }
      const repo = getRepo();
      const result = guardian.decideBotReviewAction(parseInt(prStr, 10), reviewer, repo);
      console.log(JSON.stringify(result));
      break;
    }

    case 'guardian-post-wait': {
      const [prStr] = args;
      if (!prStr) { console.error('Usage: pipeline guardian-post-wait <pr>'); process.exit(1); }
      const repo = getRepo();
      const result = guardian.checkPostWaitConditions(parseInt(prStr, 10), repo);
      console.log(JSON.stringify(result));
      break;
    }

    case 'guardian-claude-review': {
      const [prStr, commentBody] = args;
      if (!prStr) { console.error('Usage: pipeline guardian-claude-review <pr> <comment_body>'); process.exit(1); }
      const repo = getRepo();
      const result = guardian.decideClaudeReviewAction(parseInt(prStr, 10), commentBody ?? '', repo);
      console.log(JSON.stringify(result));
      break;
    }

    case 'guardian-ensure-review': {
      const [prStr] = args;
      if (!prStr) { console.error('Usage: pipeline guardian-ensure-review <pr>'); process.exit(1); }
      const repo = getRepo();
      const result = guardian.decideEnsureReviewAction(parseInt(prStr, 10), repo);
      console.log(JSON.stringify(result));
      break;
    }

    // ─── Git Commands ─────────────────────────────────────────────────

    case 'setup-git-auth': {
      setupGitAuth();
      break;
    }

    case 'merge-master': {
      const success = mergeMasterIntoBranch();
      process.exit(success ? 0 : 1);
    }

    case 'commit': {
      const [message, coAuthor] = args;
      if (!message) { console.error('Usage: pipeline commit <message> [co-author]'); process.exit(1); }
      const created = checkChangesAndCommit(message, coAuthor);
      process.exit(created ? 0 : 1);
    }

    case 'push': {
      const [branch, prePushHead] = args;
      if (!branch) { console.error('Usage: pipeline push <branch> [pre-push-head]'); process.exit(1); }
      smartPush(branch, prePushHead);
      break;
    }

    case 'update-branch': {
      // Update a PR branch to latest master and dispatch CI.
      // GitHub's pull_request event doesn't reliably fire after branch
      // updates, so we explicitly dispatch test.yml + e2e-smoke.yml.
      const [prStr] = args;
      const pr = parseInt(prStr, 10);
      if (isNaN(pr)) { console.error('Usage: pipeline update-branch <pr>'); process.exit(1); }
      const github = getGitHub();
      const prData = await github.getPR(pr);
      const branchName = prData.head.ref;
      console.log(`Updating branch ${branchName} to latest master...`);
      await github.updateBranch(pr);
      console.log('Branch updated — dispatching CI');
      await github.dispatchWorkflow('test.yml', branchName);
      await github.dispatchWorkflow('e2e-smoke.yml', branchName);
      console.log('Dispatched test.yml + e2e-smoke.yml');
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run without arguments to see available commands.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
