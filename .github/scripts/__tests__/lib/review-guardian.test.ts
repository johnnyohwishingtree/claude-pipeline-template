import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  decideBotReviewAction,
  checkPostWaitConditions,
  decideClaudeReviewAction,
  decideEnsureReviewAction,
} from '../../lib/review-guardian.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockReturnValue(''),
}));

const mockExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;

function mockExecSequence(values: (string | Error)[]) {
  mockExecFileSync.mockReset();
  values.forEach((val) => {
    if (val instanceof Error) {
      mockExecFileSync.mockImplementationOnce(() => { throw val; });
    } else {
      mockExecFileSync.mockReturnValueOnce(val);
    }
  });
}

describe('review-guardian', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileSync.mockReturnValue('');
  });

  // ─── Bot review decision ──────────────────────────────────────

  describe('decideBotReviewAction', () => {
    it('returns already-approved when approval exists', () => {
      mockExecSequence(['1']); // count-approvals
      const result = decideBotReviewAction(10, 'gemini-code-assist[bot]', 'owner/repo');
      expect(result.action).toBe('already-approved');
    });

    it('defers when critical comments with unresolved threads', () => {
      mockExecSequence([
        '0', // count-approvals
        '2', // count-critical-comments
        '1', // count-unresolved-threads
      ]);
      const result = decideBotReviewAction(10, 'gemini-code-assist[bot]', 'owner/repo');
      expect(result.action).toBe('defer-critical');
      if (result.action === 'defer-critical') {
        expect(result.criticalCount).toBe(2);
        expect(result.unresolvedCount).toBe(1);
      }
    });

    it('approves when critical comments but all threads resolved', () => {
      mockExecSequence([
        '0', // count-approvals
        '2', // count-critical-comments
        '0', // count-unresolved-threads
      ]);
      const result = decideBotReviewAction(10, 'gemini-code-assist[bot]', 'owner/repo');
      expect(result.action).toBe('approve');
    });

    it('approves when no critical comments', () => {
      mockExecSequence([
        '0', // count-approvals
        '0', // count-critical-comments
      ]);
      const result = decideBotReviewAction(10, 'copilot[bot]', 'owner/repo');
      expect(result.action).toBe('approve');
      if (result.action === 'approve') {
        expect(result.reviewer).toBe('copilot[bot]');
      }
    });
  });

  describe('checkPostWaitConditions', () => {
    it('defers when review-fix is active', () => {
      mockExecSequence(['']); // is-workflow-active succeeds
      const result = checkPostWaitConditions(10, 'owner/repo');
      expect(result.action).toBe('defer-review-fix-active');
    });

    it('defers when relay posted dispatch comment', () => {
      mockExecSequence([
        new Error('not active'), // is-workflow-active fails
        '1', // relay comment count
      ]);
      const result = checkPostWaitConditions(10, 'owner/repo');
      expect(result.action).toBe('defer-relay-posted');
    });

    it('approves when no active review-fix and no relay', () => {
      mockExecSequence([
        new Error('not active'), // is-workflow-active fails
        '0', // relay comment count
      ]);
      const result = checkPostWaitConditions(10, 'owner/repo');
      expect(result.action).toBe('approve');
    });
  });

  // ─── Claude review decision ───────────────────────────────────

  describe('decideClaudeReviewAction', () => {
    it('returns not-review-response when no review was requested', () => {
      mockExecSequence(['0']); // review request count
      const result = decideClaudeReviewAction(10, 'Some comment', 'owner/repo');
      expect(result.action).toBe('not-review-response');
    });

    it('returns already-approved when approval exists', () => {
      mockExecSequence([
        '1', // review request count
        '1', // count-approvals
      ]);
      const result = decideClaudeReviewAction(10, 'LGTM', 'owner/repo');
      expect(result.action).toBe('already-approved');
    });

    it('returns has-critical-inline when critical comments exist', () => {
      mockExecSequence([
        '1', // review request count
        '0', // count-approvals
        '3', // count-critical-comments
      ]);
      const result = decideClaudeReviewAction(10, 'LGTM', 'owner/repo');
      expect(result.action).toBe('has-critical-inline');
      if (result.action === 'has-critical-inline') {
        expect(result.count).toBe(3);
      }
    });

    it('returns has-issues when Claude flags problems', () => {
      mockExecSequence([
        '1', // review request count
        '0', // count-approvals
        '0', // count-critical-comments
      ]);
      const result = decideClaudeReviewAction(10, 'I found a critical bug in the auth module', 'owner/repo');
      expect(result.action).toBe('has-issues');
    });

    it('detects "request changes" variant', () => {
      mockExecSequence(['1', '0', '0']);
      const result = decideClaudeReviewAction(10, 'I request changes to this PR', 'owner/repo');
      expect(result.action).toBe('has-issues');
    });

    it('detects "do not merge"', () => {
      mockExecSequence(['1', '0', '0']);
      const result = decideClaudeReviewAction(10, 'Do not merge this yet', 'owner/repo');
      expect(result.action).toBe('has-issues');
    });

    it('approves clean review', () => {
      mockExecSequence([
        '1', // review request count
        '0', // count-approvals
        '0', // count-critical-comments
      ]);
      const result = decideClaudeReviewAction(10, 'Looks good, well-structured code', 'owner/repo');
      expect(result.action).toBe('approve');
    });
  });

  // ─── Ensure review decision ───────────────────────────────────

  describe('decideEnsureReviewAction', () => {
    it('returns already-approved when approval exists', () => {
      mockExecSequence(['1']); // count-approvals
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('already-approved');
    });

    it('approves when reviews exist, all threads resolved, all CI passes', () => {
      mockExecSequence([
        '0', // count-approvals
        '2', // review count
        '0', // unresolved threads
        'abc123', // headRefOid
        'TESTS_PASS=true', // check-ci-status
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('approve');
    });

    it('dispatches auto-merge when threads resolved but CI incomplete', () => {
      mockExecSequence([
        '0', // count-approvals
        '1', // review count
        '0', // unresolved threads
        'abc123', // headRefOid
        'TESTS_PASS=false', // check-ci-status — tests not passing
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('dispatch-auto-merge');
    });

    it('returns review-fix-active when unresolved threads and review-fix running', () => {
      mockExecSequence([
        '0', // count-approvals
        '1', // review count
        '2', // unresolved threads
        '',  // is-workflow-active succeeds
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('review-fix-active');
    });

    it('dispatches review-fix when unresolved threads and no review-fix running', () => {
      mockExecSequence([
        '0', // count-approvals
        '1', // review count
        '2', // unresolved threads
        new Error('not active'), // is-workflow-active fails
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('dispatch-review-fix');
    });

    it('returns already-requested when fallback review already asked for', () => {
      mockExecSequence([
        '0', // count-approvals
        '0', // review count (no formal reviews)
        '1', // existing review request count
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('already-requested');
    });

    it('requests review when no reviews and no fallback requested', () => {
      mockExecSequence([
        '0', // count-approvals
        '0', // review count
        '0', // existing review request count
      ]);
      const result = decideEnsureReviewAction(10, 'owner/repo');
      expect(result.action).toBe('request-review');
    });
  });
});
