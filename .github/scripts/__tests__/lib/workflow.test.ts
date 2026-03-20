import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityRunner } from '../../lib/workflow.js';
import type { GitHubClient } from '../../lib/github.js';
import type { PipelineStateData, ActivityType, PipelineState } from '../../lib/types.js';

function createState(
  state: PipelineState,
  overrides: Partial<PipelineStateData> = {}
): PipelineStateData {
  return {
    state,
    attempt: 0,
    maxAttempts: 6,
    branches: { pr: null, tmp: null, internal: null },
    prNumber: null,
    lastTransition: new Date().toISOString(),
    history: [{ state, at: new Date().toISOString() }],
    lockId: null,
    errorContext: null,
    ...overrides,
  };
}

function createMockGitHub(stateData: PipelineStateData | null = null) {
  const comments: Array<{ id: number; body: string }> = [];

  if (stateData) {
    comments.push({
      id: 1,
      body: `<!-- pipeline-state -->\n<details><summary>Pipeline: ${stateData.state}</summary>\n\n\`\`\`json\n${JSON.stringify(stateData, null, 2)}\n\`\`\`\n</details>`,
    });
  }

  return {
    getIssueComments: vi.fn().mockResolvedValue(comments),
    commentOnIssue: vi.fn().mockImplementation((_n: number, body: string) => {
      comments.push({ id: comments.length + 1, body });
    }),
    updateComment: vi.fn().mockImplementation((id: number, body: string) => {
      const idx = comments.findIndex((c) => c.id === id);
      if (idx >= 0) comments[idx].body = body;
    }),
    dispatchWorkflow: vi.fn().mockResolvedValue(undefined),
    // Methods called by merge-gate but not by workflow
    getPR: vi.fn(),
    checkCIStatus: vi.fn(),
    countApprovals: vi.fn(),
    countUnresolvedThreads: vi.fn(),
    compareBranches: vi.fn(),
    isWorkflowActive: vi.fn(),
  } as unknown as GitHubClient;
}

describe('ActivityRunner', () => {
  describe('activityStart', () => {
    it('returns context when state is valid', async () => {
      const state = createState('implementing');
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = await runner.activityStart(42, 'verify', ['implementing', 'fix-loop'], 'run-123');

      expect(ctx).not.toBeNull();
      expect(ctx!.issueNumber).toBe(42);
      expect(ctx!.activityName).toBe('verify');
      expect(ctx!.lockId).toBe('verify-run-123');
    });

    it('returns null when state is not in valid list', async () => {
      const state = createState('approved');
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = await runner.activityStart(42, 'verify', ['implementing', 'fix-loop']);

      expect(ctx).toBeNull();
    });

    it('allows implement activity from unknown state', async () => {
      const github = createMockGitHub(null); // no state = unknown
      const runner = new ActivityRunner(github);

      const ctx = await runner.activityStart(42, 'implement', ['planned', 'stuck']);

      expect(ctx).not.toBeNull();
    });

    it('returns null when lock is held by another run', async () => {
      const state = createState('implementing', { lockId: 'other-lock' });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = await runner.activityStart(42, 'verify', ['implementing']);

      expect(ctx).toBeNull();
    });

    it('succeeds when lock is already held by same id (idempotent)', async () => {
      const state = createState('implementing', { lockId: 'verify-run-123' });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = await runner.activityStart(42, 'verify', ['implementing'], 'run-123');

      expect(ctx).not.toBeNull();
    });

    it('throws when no valid from states provided', async () => {
      const github = createMockGitHub(null);
      const runner = new ActivityRunner(github);

      await expect(
        runner.activityStart(42, 'verify', [])
      ).rejects.toThrow('At least one validFromState is required');
    });
  });

  describe('activitySuccess', () => {
    it('transitions to next state and releases lock', async () => {
      const state = createState('implementing', { lockId: 'verify-run-1' });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = { issueNumber: 42, activityName: 'verify' as ActivityType, lockId: 'verify-run-1' };
      // implementing → verifying is a valid transition
      const result = await runner.activitySuccess(ctx, 'verifying');

      expect(result.state).toBe('verifying');
      // Lock should be released (writeState called with lockId: null)
      expect(github.updateComment).toHaveBeenCalled();
    });
  });

  describe('activityFail', () => {
    it('increments attempt counter and retries when under max', async () => {
      const state = createState('fix-loop', {
        lockId: 'fix-run-1',
        attempts: { fix: 1 },
      });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = { issueNumber: 42, activityName: 'fix' as ActivityType, lockId: 'fix-run-1' };
      const result = await runner.activityFail(ctx, 'typecheck failed', {
        workflowFile: 'verify-and-fix.yml',
        branch: 'master',
        inputs: { issue_number: '42' },
      });

      expect(result.retried).toBe(true);
      expect(result.attempt).toBe(2);
      expect(github.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml', 'master', { issue_number: '42' }
      );
    });

    it('escalates when max attempts exhausted', async () => {
      const state = createState('fix-loop', {
        lockId: 'fix-run-1',
        maxAttempts: 3,
        attempts: { fix: 2 },
      });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = { issueNumber: 42, activityName: 'fix' as ActivityType, lockId: 'fix-run-1' };
      const result = await runner.activityFail(ctx, 'tests still failing');

      expect(result.retried).toBe(false);
      expect(result.attempt).toBe(3);
      expect(result.maxAttempts).toBe(3);
      // Should NOT dispatch retry
      expect(github.dispatchWorkflow).not.toHaveBeenCalled();
    });

    it('handles missing attempts field gracefully', async () => {
      const state = createState('fix-loop', { lockId: 'fix-run-1' });
      // No attempts field at all
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const ctx = { issueNumber: 42, activityName: 'fix' as ActivityType, lockId: 'fix-run-1' };
      const result = await runner.activityFail(ctx, 'lint error');

      expect(result.attempt).toBe(1);
      expect(result.retried).toBe(true);
    });
  });

  describe('activityGetAttempt', () => {
    it('returns current attempt count', async () => {
      const state = createState('verifying', { attempts: { verify: 3 } });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const attempt = await runner.activityGetAttempt(42, 'verify');
      expect(attempt).toBe(3);
    });

    it('returns 0 for untracked activity', async () => {
      const state = createState('verifying');
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      const attempt = await runner.activityGetAttempt(42, 'fix');
      expect(attempt).toBe(0);
    });

    it('returns 0 when no state exists', async () => {
      const github = createMockGitHub(null);
      const runner = new ActivityRunner(github);

      const attempt = await runner.activityGetAttempt(42, 'verify');
      expect(attempt).toBe(0);
    });
  });

  describe('activityResetAttempts', () => {
    it('resets attempt counter to 0', async () => {
      const state = createState('verifying', { attempts: { verify: 4 } });
      const github = createMockGitHub(state);
      const runner = new ActivityRunner(github);

      await runner.activityResetAttempts(42, 'verify');

      // Read the updated state from mock
      const attempt = await runner.activityGetAttempt(42, 'verify');
      expect(attempt).toBe(0);
    });

    it('no-ops when no state exists', async () => {
      const github = createMockGitHub(null);
      const runner = new ActivityRunner(github);

      // Should not throw
      await runner.activityResetAttempts(42, 'verify');
    });
  });
});
