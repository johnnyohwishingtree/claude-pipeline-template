import { describe, it, expect, vi } from 'vitest';
import { evaluateMergeGate } from '../../lib/merge-gate.js';
import type { GitHubClient } from '../../lib/github.js';

function createMockGitHub(
  overrides: Partial<{
    testsPass: boolean;
    approvals: number;
    unresolvedThreads: number;
    reviewFixActive: boolean;
    branchStatus: 'ahead' | 'behind' | 'diverged' | 'identical';
    mergeableState: string;
  }> = {}
): GitHubClient {
  const defaults = {
    testsPass: true,
    approvals: 1,
    unresolvedThreads: 0,
    reviewFixActive: false,
    branchStatus: 'ahead' as const,
    mergeableState: 'clean',
  };
  const config = { ...defaults, ...overrides };

  return {
    owner: 'testowner',
    getPR: vi.fn().mockResolvedValue({
      head: { sha: 'abc123', ref: 'claude/issue-42' },
      user: { login: 'bot-user' },
      mergeable_state: config.mergeableState,
    }),
    checkCIStatus: vi.fn().mockResolvedValue({
      testsPass: config.testsPass,
    }),
    countApprovals: vi.fn().mockResolvedValue(config.approvals),
    countUnresolvedThreads: vi
      .fn()
      .mockResolvedValue(config.unresolvedThreads),
    isWorkflowActive: vi.fn().mockResolvedValue(config.reviewFixActive),
    compareBranches: vi.fn().mockResolvedValue(config.branchStatus),
  } as unknown as GitHubClient;
}

describe('evaluateMergeGate', () => {
  it('returns "merge" when all conditions pass', async () => {
    const github = createMockGitHub();
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('merge');
    expect(result.failingConditions).toHaveLength(0);
    expect(result.conditions).toEqual({
      testsPass: true,
      approved: true,
      threadsResolved: true,
      noActiveReviewFix: true,
      branchUpToDate: true,
    });
  });

  it('returns "update_branch" when only branch is behind', async () => {
    const github = createMockGitHub({ branchStatus: 'behind' });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('update_branch');
    expect(result.failingConditions).toEqual(['branchUpToDate']);
  });

  it('returns "wait" when tests fail', async () => {
    const github = createMockGitHub({ testsPass: false });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('wait');
    expect(result.failingConditions).toContain('testsPass');
  });

  it('returns "wait" when no approvals', async () => {
    const github = createMockGitHub({ approvals: 0 });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('wait');
    expect(result.failingConditions).toContain('approved');
  });

  it('returns "wait" when unresolved threads exist', async () => {
    const github = createMockGitHub({ unresolvedThreads: 3 });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('wait');
    expect(result.failingConditions).toContain('threadsResolved');
  });

  it('returns "wait" when review-fix is active', async () => {
    const github = createMockGitHub({ reviewFixActive: true });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('wait');
    expect(result.failingConditions).toContain('noActiveReviewFix');
  });

  it('returns "wait" when multiple conditions fail', async () => {
    const github = createMockGitHub({
      testsPass: false,
      approvals: 0,
      branchStatus: 'behind',
    });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('wait');
    expect(result.failingConditions).toContain('testsPass');
    expect(result.failingConditions).toContain('approved');
    expect(result.failingConditions).toContain('branchUpToDate');
  });

  it('returns "merge" when branch is identical (up to date)', async () => {
    const github = createMockGitHub({ branchStatus: 'identical' });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('merge');
  });

  it('returns "update_branch" when branch is diverged', async () => {
    const github = createMockGitHub({ branchStatus: 'diverged' });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('update_branch');
    expect(result.failingConditions).toEqual(['branchUpToDate']);
  });

  it('returns "resolve_conflicts" when branch is behind and has merge conflicts', async () => {
    const github = createMockGitHub({ branchStatus: 'behind', mergeableState: 'dirty' });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('resolve_conflicts');
  });

  it('returns "resolve_conflicts" when conditions fail and PR has conflicts', async () => {
    const github = createMockGitHub({
      testsPass: false,
      branchStatus: 'diverged',
      mergeableState: 'dirty',
    });
    const result = await evaluateMergeGate(github, 42);

    // Conflicts take priority over wait — resolve them first
    expect(result.action).toBe('resolve_conflicts');
  });

  it('returns "update_branch" when behind but no conflicts', async () => {
    const github = createMockGitHub({ branchStatus: 'behind', mergeableState: 'clean' });
    const result = await evaluateMergeGate(github, 42);

    expect(result.action).toBe('update_branch');
  });

  it('returns "merge" when PR author is repo owner and no formal approval exists', async () => {
    // In personal repos, GITHUB_TOKEN and GH_PAT both belong to the owner,
    // so neither can approve the owner's own PR. The merge gate should treat
    // owner-authored PRs as implicitly approved.
    const github = createMockGitHub({ approvals: 0 });
    // Override getPR to return owner as author
    (github.getPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      head: { sha: 'abc123', ref: 'feat/my-feature' },
      user: { login: 'testowner' },
    });
    // github.owner is 'testowner' (from createMockGitHub's repo split)

    const result = await evaluateMergeGate(github, 42);

    // Should merge — owner's PR is implicitly approved
    expect(result.action).toBe('merge');
    expect(result.conditions.approved).toBe(true);
    expect(result.failingConditions).not.toContain('approved');
  });
});
