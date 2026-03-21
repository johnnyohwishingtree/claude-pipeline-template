import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { hasLabel, getFailedItems, dispatchPRFix, dispatchMasterFix } from '../../lib/ci-dispatch.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockReturnValue(''),
}));

// Mock github client
vi.mock('../../lib/github.js', () => ({
  GitHubClient: vi.fn(),
}));

const mockExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;

function mockExec(returnValue: string) {
  mockExecFileSync.mockReturnValue(returnValue);
}

function mockExecSequence(values: string[]) {
  mockExecFileSync.mockReset();
  values.forEach((val) => mockExecFileSync.mockReturnValueOnce(val));
}

function mockExecThrow() {
  mockExecFileSync.mockImplementation(() => {
    throw new Error('command failed');
  });
}

interface ExecCall {
  cmd: string;
  args: string[];
}

function getExecCalls(): ExecCall[] {
  return mockExecFileSync.mock.calls.map((call: unknown[]) => ({
    cmd: call[0] as string,
    args: call[1] as string[],
  }));
}

describe('ci-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasLabel', () => {
    it('returns true when label is present', () => {
      mockExec('bug,no-autofix,enhancement');
      expect(hasLabel(42, 'no-autofix', 'owner/repo')).toBe(true);
    });

    it('returns false when label is absent', () => {
      mockExec('bug,enhancement');
      expect(hasLabel(42, 'no-autofix', 'owner/repo')).toBe(false);
    });

    it('returns false on empty labels', () => {
      mockExec('');
      expect(hasLabel(42, 'no-autofix', 'owner/repo')).toBe(false);
    });

    it('returns false when gh command fails', () => {
      mockExecThrow();
      expect(hasLabel(42, 'no-autofix', 'owner/repo')).toBe(false);
    });

    it('does not match partial label names', () => {
      mockExec('no-autofix-v2,autofix');
      expect(hasLabel(42, 'no-autofix', 'owner/repo')).toBe(false);
    });

    it('calls gh with correct arguments', () => {
      mockExec('');
      hasLabel(99, 'my-label', 'org/my-repo');
      const calls = getExecCalls();
      expect(calls[0].cmd).toBe('gh');
      expect(calls[0].args).toContain('99');
      expect(calls[0].args).toContain('--repo');
      expect(calls[0].args).toContain('org/my-repo');
    });
  });

  describe('getFailedItems', () => {
    it('returns failed job names in jobs mode', () => {
      mockExec('build, deploy');
      const result = getFailedItems('12345', 'jobs');
      expect(result).toBe('build, deploy');
      const calls = getExecCalls();
      const allArgs = calls[0].args.join(' ');
      expect(allArgs).toContain('select(.conclusion == "failure") | .name');
      expect(allArgs).toContain('.jobs[]');
      expect(allArgs).not.toContain('.steps[]');
    });

    it('returns failed step names in steps mode', () => {
      mockExec('Type check, Run tests');
      const result = getFailedItems('12345', 'steps');
      expect(result).toBe('Type check, Run tests');
      const calls = getExecCalls();
      const allArgs = calls[0].args.join(' ');
      expect(allArgs).toContain('.steps[]');
    });

    it('deduplicates step names across jobs', () => {
      mockExec('Type check');
      getFailedItems('12345', 'steps');
      const calls = getExecCalls();
      const allArgs = calls[0].args.join(' ');
      expect(allArgs).toContain('unique');
    });

    it('returns "unknown" when gh command fails', () => {
      mockExecThrow();
      expect(getFailedItems('12345', 'jobs')).toBe('unknown');
    });

    it('returns "unknown" when result is empty', () => {
      mockExec('');
      expect(getFailedItems('12345', 'jobs')).toBe('unknown');
    });
  });

  describe('dispatchPRFix', () => {
    const mockGitHub = {
      commentOnIssue: vi.fn().mockResolvedValue(undefined),
      dispatchWorkflow: vi.fn().mockResolvedValue(undefined),
    };

    const baseOpts = {
      pr: 42,
      branch: 'feat/my-feature',
      runId: '99999',
      runUrl: 'https://github.com/owner/repo/actions/runs/99999',
      repo: 'owner/repo',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('skips when PR has no-autofix label', async () => {
      mockExec('no-autofix,bug');
      const result = await dispatchPRFix(mockGitHub as any, baseOpts);
      expect(result.skipped).toBe(true);
      expect(mockGitHub.commentOnIssue).not.toHaveBeenCalled();
      expect(mockGitHub.dispatchWorkflow).not.toHaveBeenCalled();
    });

    it('dispatches for CI failures with step names', async () => {
      // First call: hasLabel check (no label), Second call: getFailedItems
      mockExecSequence(['bug,enhancement', 'Type check, Run tests']);

      const result = await dispatchPRFix(mockGitHub as any, baseOpts);

      expect(result.skipped).toBe(false);
      expect(result.failedItems).toBe('Type check, Run tests');

      // Verify comment
      expect(mockGitHub.commentOnIssue).toHaveBeenCalledWith(
        42,
        expect.stringContaining('CI checks failed (Type check, Run tests)')
      );

      // Verify dispatch
      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          branch: 'feat/my-feature',
          issue_number: '42',
          checks: 'ci',
          fix_enabled: 'true',
          max_attempts: '3',
        })
      );
    });

    it('includes extra context when provided', async () => {
      mockExecSequence(['', 'Type check']);

      await dispatchPRFix(mockGitHub as any, {
        ...baseOpts,
        extraContext: 'Check the config.',
      });

      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          fix_context: expect.stringContaining('Check the config.'),
        })
      );
    });
  });

  describe('dispatchMasterFix', () => {
    const mockGitHub = {
      dispatchWorkflow: vi.fn().mockResolvedValue(undefined),
    };

    const baseOpts = {
      runId: '88888',
      runUrl: 'https://github.com/owner/repo/actions/runs/88888',
      repo: 'owner/repo',
      branchPrefix: 'fix/master-ci',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates branch, pushes, and dispatches', async () => {
      // getFailedItems call, then git checkout, git push
      mockExecSequence(['Type check', '', '']);

      const result = await dispatchMasterFix(mockGitHub as any, baseOpts);

      expect(result.branch).toMatch(/^fix\/master-ci-\d{12}$/);
      expect(result.failedItems).toBe('Type check');

      const calls = getExecCalls();
      expect(calls.some((c) => c.cmd === 'git' && c.args.includes('checkout'))).toBe(true);
      expect(calls.some((c) => c.cmd === 'git' && c.args.includes('push'))).toBe(true);

      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          branch: result.branch,
          checks: 'ci',
          create_pr: 'true',
          fix_context: expect.stringContaining('CI failed on master'),
        })
      );
    });

    it('includes extra context when provided', async () => {
      mockExecSequence(['Type check', '', '']);

      await dispatchMasterFix(mockGitHub as any, {
        ...baseOpts,
        extraContext: 'Fix the mocks.',
      });

      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          fix_context: expect.stringContaining('Fix the mocks.'),
        })
      );
    });
  });
});
