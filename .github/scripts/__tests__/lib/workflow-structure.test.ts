/**
 * Structural regression tests for GitHub Actions workflows.
 *
 * These validate that workflow YAML files follow required patterns
 * to prevent CI failures. Each test documents the bug it prevents.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const WORKFLOWS_DIR = join(__dirname, '../../../workflows');
const SCRIPTS_DIR = join(__dirname, '../..');

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  if?: string;
}

interface WorkflowJob {
  'runs-on'?: string;
  steps?: WorkflowStep[];
  env?: Record<string, string>;
}

interface Workflow {
  name?: string;
  jobs?: Record<string, WorkflowJob>;
}

function loadWorkflows(): Array<{ name: string; workflow: Workflow }> {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));
  return files.map((f) => ({
    name: f,
    workflow: yaml.load(readFileSync(join(WORKFLOWS_DIR, f), 'utf-8')) as Workflow,
  }));
}

function getJobsUsingPipelineTS(
  workflow: Workflow
): Array<{ jobName: string; job: WorkflowJob }> {
  const result: Array<{ jobName: string; job: WorkflowJob }> = [];
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    const steps = job.steps ?? [];
    const usesTSCLI = steps.some(
      (s) =>
        typeof s.run === 'string' &&
        s.run.includes('.github/scripts/lib/cli/')
    );
    if (usesTSCLI) result.push({ jobName, job });
  }
  return result;
}

describe('workflow structure regressions', () => {
  const workflows = loadWorkflows();

  // Bug: setup-pipeline-ts action not found because sparse-checkout
  // only included .github/scripts but the action is at .github/actions/.
  // Fixed in PR #426.
  describe('sparse-checkout must include .github/actions when using local actions', () => {
    it('every sparse-checkout that includes .github/scripts also includes .github/actions', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
          const steps = job.steps ?? [];

          for (const step of steps) {
            if (!step.with || typeof step.with['sparse-checkout'] !== 'string') continue;

            const sparseCheckout = step.with['sparse-checkout'];
            const includesScripts = sparseCheckout.includes('.github/scripts');
            const includesActions = sparseCheckout.includes('.github/actions');

            // If checking out scripts, must also check out actions
            // (setup-pipeline-ts lives there)
            if (includesScripts && !includesActions) {
              failures.push(
                `${name} → job "${jobName}": sparse-checkout includes .github/scripts but NOT .github/actions`
              );
            }
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Bug: Jobs using npx tsx pipeline CLI without setup-pipeline-ts
  // would fail with "tsx: command not found" or missing dependencies.
  describe('every job using pipeline TS CLI has setup-pipeline-ts', () => {
    it('all jobs calling npx tsx .github/scripts/lib/cli/ have setup-pipeline-ts step', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        const jobs = getJobsUsingPipelineTS(workflow);

        for (const { jobName, job } of jobs) {
          const steps = job.steps ?? [];
          const hasSetup = steps.some(
            (s) =>
              typeof s.uses === 'string' &&
              s.uses.includes('setup-pipeline-ts')
          );

          if (!hasSetup) {
            failures.push(
              `${name} → job "${jobName}": uses TS CLI but missing setup-pipeline-ts`
            );
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Bug: Jobs using setup-pipeline-ts without checkout would fail with
  // "Can't find action.yml" because the composite action wasn't available.
  describe('every job using setup-pipeline-ts has a checkout step', () => {
    it('all jobs with setup-pipeline-ts have actions/checkout before it', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
          const steps = job.steps ?? [];

          const setupIdx = steps.findIndex(
            (s) =>
              typeof s.uses === 'string' &&
              s.uses.includes('setup-pipeline-ts')
          );

          if (setupIdx < 0) continue;

          const hasCheckoutBefore = steps.slice(0, setupIdx).some(
            (s) =>
              typeof s.uses === 'string' &&
              s.uses.includes('actions/checkout')
          );

          if (!hasCheckoutBefore) {
            failures.push(
              `${name} → job "${jobName}": setup-pipeline-ts at step ${setupIdx} but no checkout before it`
            );
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Bug: Workflows must not reference BASH_ENV or lib.sh functions directly.
  // The migration to TypeScript CLI replaced all bash functions.
  describe('no workflow references BASH_ENV or old bash functions', () => {
    it('no job sets BASH_ENV in env', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
          const jobEnv = job.env ?? {};
          if ('BASH_ENV' in jobEnv) {
            failures.push(`${name} → job "${jobName}": still sets BASH_ENV`);
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });

    it('no step calls old bash function names directly', () => {
      const oldFunctions = [
        'setup_git_auth',
        'check_changes_and_commit',
        'smart_push',
        'comment_on_issue',
        'dispatch_workflow',
        'merge_master_into_branch',
        'count_approvals',
        'count_unresolved_threads',
        'resolve_all_threads',
        'approve_and_merge',
        'get_pr_number',
        'is_workflow_active',
        'count_critical_comments',
        'get_next_pending_story',
        'trigger_story_agent',
        'check_ci_status',
      ];

      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
          for (const step of job.steps ?? []) {
            if (typeof step.run !== 'string') continue;
            for (const fn of oldFunctions) {
              // Match function call (word boundary) but not in comments
              const lines = step.run.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#')) continue;
                // Match as a standalone command (not inside a string or comment)
                const pattern = new RegExp(`(?:^|\\s|;|&&|\\|\\|)${fn}(?:\\s|$|\\()`);
                if (pattern.test(trimmed)) {
                  failures.push(
                    `${name} → job "${jobName}" → step "${step.name}": calls old bash function ${fn}()`
                  );
                }
              }
            }
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Bug: Give-up or error comments containing @claude or @gemini
  // trigger new workflow runs, creating infinite loops.
  describe('no automated comments contain agent triggers', () => {
    it('no pipeline.ts comment call body contains @claude or @gemini literally', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
          for (const step of job.steps ?? []) {
            if (typeof step.run !== 'string') continue;
            if (!step.run.includes('pipeline.ts comment')) continue;

            // Extract comment body — look for the string after comment <num>
            // Skip lines that are intentionally triggering agents
            // (trigger-story-agent, fallback review requests)
            if (step.run.includes('trigger-story-agent')) continue;
            if (step.run.includes('perform a comprehensive code review')) continue;
            if (step.run.includes('Fix the issues from the code review')) continue;

            // Check for accidental @claude/@gemini in status/error comments
            const lines = step.run.split('\n');
            for (const line of lines) {
              if (line.includes('pipeline.ts comment') && /@(claude|gemini)(?!\[)/i.test(line)) {
                if (line.includes('code review')) continue;
                failures.push(
                  `${name} → job "${jobName}" → step "${step.name}": comment call contains @claude/@gemini trigger`
                );
              }
            }
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Ensure the pipeline TS package.json has required dependencies
  describe('pipeline TypeScript dependencies', () => {
    it('package.json exists with octokit dependencies', () => {
      const pkgPath = join(SCRIPTS_DIR, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies['@octokit/rest']).toBeDefined();
      expect(pkg.dependencies['@octokit/graphql']).toBeDefined();
    });

    it('pipeline CLI entry point exists', () => {
      const cliPath = join(SCRIPTS_DIR, 'lib/cli/pipeline.ts');
      const content = readFileSync(cliPath, 'utf-8');
      expect(content).toContain('main()');
    });

    it('verify-checks CLI entry point exists', () => {
      const cliPath = join(SCRIPTS_DIR, 'lib/cli/verify-checks.ts');
      const content = readFileSync(cliPath, 'utf-8');
      expect(content).toContain('runVerifyChecks');
    });
  });

  // Bug: review-fix prompt must NOT tell Claude to push — the workflow
  // handles pushing after Claude finishes. If Claude pushes during its
  // run, the post-run push step conflicts.
  describe('review-fix safety', () => {
    it('review-fix claude-code-action prompt does not instruct pushing', () => {
      const wf = workflows.find((w) => w.name === 'review-fix.yml');
      expect(wf).toBeDefined();
      if (!wf) return;

      for (const job of Object.values(wf.workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (step.uses?.includes('claude-code-action')) {
            const prompt = (step as any).with?.prompt ?? '';
            const systemPrompt = (step as any).with?.['system-prompt'] ?? '';
            expect(prompt.toLowerCase()).not.toContain('git push');
            expect(systemPrompt.toLowerCase()).not.toContain('git push');
          }
        }
      }
    });
  });

  // Ensure concurrency groups for comment-triggered workflows include
  // the comment author, preventing bot status comments from cancelling runs.
  describe('concurrency groups include author for comment-triggered workflows', () => {
    it('issue_comment workflows include comment.user.login in concurrency group', () => {
      const failures: string[] = [];

      for (const { name, workflow } of workflows) {
        // Check if triggered by issue_comment using parsed YAML
        const onEvents = (workflow as any).on;
        let isIssueCommentTrigger = false;
        if (typeof onEvents === 'string') {
          isIssueCommentTrigger = onEvents === 'issue_comment';
        } else if (Array.isArray(onEvents)) {
          isIssueCommentTrigger = onEvents.includes('issue_comment');
        } else if (onEvents && typeof onEvents === 'object') {
          isIssueCommentTrigger = 'issue_comment' in onEvents;
        }

        if (!isIssueCommentTrigger) continue;

        const group = (workflow as any).concurrency?.group;
        if (!group) continue; // No top-level concurrency group — skip
        if (!group.includes('comment.user.login')) {
          failures.push(
            `${name}: concurrency group "${group}" missing comment.user.login`
          );
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Guard: workflows that have been extracted to TypeScript must stay thin.
  describe('extracted workflows have no large inline shell blocks', () => {
    const extractedWorkflows: Record<string, { maxRunLines: number; module: string }> = {
      'watcher.yml': { maxRunLines: 5, module: 'lib/watcher.ts' },
      'pipeline-doctor.yml': { maxRunLines: 10, module: 'lib/doctor.ts' },
    };

    for (const [wfName, { maxRunLines, module }] of Object.entries(extractedWorkflows)) {
      it(`${wfName}: no run: block exceeds ${maxRunLines} lines (logic belongs in ${module})`, () => {
        const wf = workflows.find((w) => w.name === wfName);
        expect(wf, `${wfName} not found`).toBeDefined();
        if (!wf) return;

        const failures: string[] = [];
        for (const [jobName, job] of Object.entries(wf.workflow.jobs ?? {})) {
          for (const step of job.steps ?? []) {
            if (typeof step.run !== 'string') continue;
            if (step.uses?.includes('claude-code-action')) continue;

            const lineCount = step.run.trim().split('\n').length;
            if (lineCount > maxRunLines) {
              failures.push(
                `${wfName} → job "${jobName}" → step "${step.name}": ${lineCount} lines (max ${maxRunLines}). Move logic to ${module}.`
              );
            }
          }
        }

        expect(failures, failures.join('\n')).toHaveLength(0);
      });
    }

    it('review-guardian.yml: no run: block calls gh api with inline jq queries > 2 lines', () => {
      const wf = workflows.find((w) => w.name === 'review-guardian.yml');
      expect(wf, 'review-guardian.yml not found').toBeDefined();
      if (!wf) return;

      const failures: string[] = [];
      for (const [jobName, job] of Object.entries(wf.workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (typeof step.run !== 'string') continue;

          const lines = step.run.split('\n');
          const rawGhQueryLines = lines.filter(
            (l) => /^\s*gh\s+(api|pr\s+view|run\s+list)\s+.*(-q|--jq)/.test(l)
          );

          if (rawGhQueryLines.length > 2) {
            failures.push(
              `review-guardian.yml → job "${jobName}" → step "${step.name}": ${rawGhQueryLines.length} raw gh query calls.`
            );
          }
        }
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    });
  });

  // Bug: verify-and-fix piped `npx playwright test` to `tee`, which swallows
  // the exit code. PRs with failing E2E were reported as passing.
  describe('verify-and-fix captures playwright exit code correctly', () => {
    it('uses pipefail or PIPESTATUS to detect playwright failures through tee', () => {
      const content = readFileSync(join(WORKFLOWS_DIR, 'verify-and-fix.yml'), 'utf-8');

      const playwrightPipedToTee = content.match(/playwright test.*\|.*tee/s);
      if (playwrightPipedToTee) {
        expect(
          content,
          'verify-and-fix must use pipefail or PIPESTATUS when piping playwright to tee',
        ).toMatch(/pipefail|PIPESTATUS/);
      }
    });
  });

  // Bug: review-relay dispatches review-fix for clean reviews (no inline
  // comments, just a summary body). This causes a deadlock: request-approval
  // defers because review-fix is "active", but review-fix produces no changes,
  // so ensure-review never re-fires and the PR gets stuck.
  describe('review-relay only dispatches for actionable feedback', () => {
    it('review-relay skips dispatch when there are no inline review comments', () => {
      const content = readFileSync(join(WORKFLOWS_DIR, 'review-relay.yml'), 'utf-8');

      // Bug (#455): when COUNT=0 (no inline comments) but REVIEW_BODY is
      // non-empty (Gemini always includes a summary), review-relay sets
      // has_feedback=true and dispatches review-fix. Claude finds nothing
      // to fix, produces no changes, and the PR deadlocks.
      //
      // Fix: when COUNT is 0, set has_feedback=false and exit early,
      // regardless of whether REVIEW_BODY exists.

      // Extract the "Collect review comments" step's run script
      const collectStep = content.match(
        /- name: Collect review comments[\s\S]*?run: \|\n([\s\S]*?)(?=\n\s+- name:)/
      );
      expect(collectStep, 'Could not find "Collect review comments" step').toBeTruthy();
      const script = collectStep![1];

      // The script must exit with has_feedback=false when COUNT is 0
      expect(
        script,
        'Must set has_feedback=false when COUNT=0 (no inline comments)',
      ).toMatch(/\$COUNT.*-eq\s*0|"\$COUNT"\s*=\s*"0"/);
    });
  });

  // Note: e2e-smoke.yml is project-specific. Add your own E2E workflow
  // and corresponding structural test when needed.
});
