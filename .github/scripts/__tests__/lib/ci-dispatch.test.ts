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
      mockExec('test-chromium, test-performance');
      const result = getFailedItems('12345', 'jobs');
      expect(result).toBe('test-chromium, test-performance');
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
      checks: 'e2e' as const,
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

    it('dispatches for e2e failures with job names', async () => {
      // First call: hasLabel check (no label), Second call: getFailedItems
      mockExecSequence(['bug,enhancement', 'test-chromium, test-cross-browser']);

      const result = await dispatchPRFix(mockGitHub as any, baseOpts);

      expect(result.skipped).toBe(false);
      expect(result.failedItems).toBe('test-chromium, test-cross-browser');

      // Verify comment
      expect(mockGitHub.commentOnIssue).toHaveBeenCalledWith(
        42,
        expect.stringContaining('E2E smoke tests failed (test-chromium, test-cross-browser)')
      );

      // Verify dispatch
      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          branch: 'feat/my-feature',
          issue_number: '42',
          checks: 'e2e',
          fix_enabled: 'true',
          max_attempts: '3',
        })
      );
    });

    it('dispatches for ci failures with step names', async () => {
      mockExecSequence(['', 'Type check, Run tests']);

      const ciOpts = { ...baseOpts, checks: 'ci' as const };
      const result = await dispatchPRFix(mockGitHub as any, ciOpts);

      expect(result.failedItems).toBe('Type check, Run tests');
      expect(mockGitHub.commentOnIssue).toHaveBeenCalledWith(
        42,
        expect.stringContaining('CI checks failed (Type check, Run tests)')
      );
      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({ checks: 'ci' })
      );
    });

    it('includes extra context when provided', async () => {
      mockExecSequence(['', 'test-chromium']);

      await dispatchPRFix(mockGitHub as any, {
        ...baseOpts,
        extraContext: 'Check webpack aliases.',
      });

      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          fix_context: expect.stringContaining('Check webpack aliases.'),
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
      checks: 'e2e' as const,
      branchPrefix: 'fix/master-e2e',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates branch, pushes, and dispatches', async () => {
      // getFailedItems call, then git checkout, git push
      mockExecSequence(['test-chromium', '', '']);

      const result = await dispatchMasterFix(mockGitHub as any, baseOpts);

      expect(result.branch).toMatch(/^fix\/master-e2e-\d{12}$/);
      expect(result.failedItems).toBe('test-chromium');

      const calls = getExecCalls();
      expect(calls.some((c) => c.cmd === 'git' && c.args.includes('checkout'))).toBe(true);
      expect(calls.some((c) => c.cmd === 'git' && c.args.includes('push'))).toBe(true);

      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          branch: result.branch,
          checks: 'e2e',
          create_pr: 'true',
          fix_context: expect.stringContaining('E2E failed on master'),
        })
      );
    });

    it('dispatches ci failures with step-level detail', async () => {
      mockExecSequence(['Type check', '', '']);

      const result = await dispatchMasterFix(mockGitHub as any, {
        ...baseOpts,
        checks: 'ci',
        branchPrefix: 'fix/master-ci',
      });

      expect(result.branch).toMatch(/^fix\/master-ci-/);
      expect(mockGitHub.dispatchWorkflow).toHaveBeenCalledWith(
        'verify-and-fix.yml',
        'master',
        expect.objectContaining({
          fix_context: expect.stringContaining('CI failed on master'),
        })
      );
    });

    it('includes extra context when provided', async () => {
      mockExecSequence(['test-chromium', '', '']);

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
