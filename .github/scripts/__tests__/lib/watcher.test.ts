import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  minutesAgo,
  extractIssueFromTitle,
  extractIssueFromBranch,
  extractLinkedIssue,
  getWorkflowSlots,
  getOpenClaudePRs,
  getOpenPRs,
  getPRChangedPaths,
  getPRMergeability,
  getPRCIConclusion,
  countCommentsByContent,
  getInProgressStories,
  findExistingWorkBranch,
  countVFGiveups,
  countSuccessfulClaudeRuns,
  getOpenEpicLabels,
  checkExistingPRForBranch,
} from '../../lib/watcher.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockReturnValue(''),
}));

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

describe('watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec('');
  });

  // ─── Pure functions ──────────────────────────────────────────────

  describe('minutesAgo', () => {
    it('returns minutes since a timestamp', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = minutesAgo(tenMinutesAgo);
      expect(result).toBeGreaterThanOrEqual(9);
      expect(result).toBeLessThanOrEqual(11);
    });

    it('returns 0 for invalid timestamp', () => {
      expect(minutesAgo('not-a-date')).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(minutesAgo('')).toBe(0);
    });
  });

  describe('extractIssueFromTitle', () => {
    it('extracts issue from Claude run title', () => {
      expect(extractIssueFromTitle('Claude #42 by user')).toBe(42);
    });

    it('extracts issue from verify-and-fix title', () => {
      expect(extractIssueFromTitle('Verify #123 on branch (attempt 1/6)')).toBe(123);
    });

    it('returns null for no match', () => {
      expect(extractIssueFromTitle('Build succeeded')).toBeNull();
    });

    it('extracts first issue when multiple present', () => {
      expect(extractIssueFromTitle('Verify #42 on branch #99')).toBe(42);
    });
  });

  describe('extractIssueFromBranch', () => {
    it('extracts issue from claude branch', () => {
      expect(extractIssueFromBranch('claude/issue-42-20260319-1234')).toBe(42);
    });

    it('extracts issue from tmp branch', () => {
      expect(extractIssueFromBranch('tmp/vf-issue-99-abc')).toBe(99);
    });

    it('returns null for non-issue branch', () => {
      expect(extractIssueFromBranch('feat/my-feature')).toBeNull();
    });
  });

  describe('extractLinkedIssue', () => {
    it('extracts from Closes #N', () => {
      expect(extractLinkedIssue('Some text\n\nCloses #42')).toBe(42);
    });

    it('extracts from Fixes #N', () => {
      expect(extractLinkedIssue('Fixes #99')).toBe(99);
    });

    it('extracts from Resolves #N', () => {
      expect(extractLinkedIssue('Resolves #7')).toBe(7);
    });

    it('is case insensitive', () => {
      expect(extractLinkedIssue('closes #42')).toBe(42);
    });

    it('returns null when no link', () => {
      expect(extractLinkedIssue('No issue reference here')).toBeNull();
    });

    it('returns null for empty body', () => {
      expect(extractLinkedIssue('')).toBeNull();
    });
  });

  // ─── Workflow slots ──────────────────────────────────────────────

  describe('getWorkflowSlots', () => {
    it('counts active and queued runs', () => {
      // 4 gh calls: active claude, queued claude, then 4 title queries
      mockExecSequence([
        '2',  // active claude runs
        '1',  // queued claude runs
        'Claude #42 by user\nClaude #43 by user', // active claude titles
        'Claude #44 by user',                      // queued claude titles
        'Verify #42 on branch',                    // active vf titles
        '',                                        // queued vf titles
      ]);

      const result = getWorkflowSlots('owner/repo', 5);
      expect(result.activeRuns).toBe(2);
      expect(result.queuedRuns).toBe(1);
      expect(result.totalActive).toBe(3);
      expect(result.slotsAvailable).toBe(2);
      expect(result.busyIssues).toContain(42);
      expect(result.busyIssues).toContain(43);
      expect(result.busyIssues).toContain(44);
    });

    it('returns 0 slots when at limit', () => {
      mockExecSequence(['3', '0', '', '', '', '']);
      const result = getWorkflowSlots('owner/repo', 3);
      expect(result.slotsAvailable).toBe(0);
    });

    it('handles gh failures gracefully', () => {
      mockExecThrow();
      // Should not throw — falls back to defaults
      const result = getWorkflowSlots('owner/repo', 3);
      expect(result.activeRuns).toBe(0);
    });
  });

  // ─── PR helpers ──────────────────────────────────────────────────

  describe('getOpenClaudePRs', () => {
    it('parses PR list JSON', () => {
      mockExec(JSON.stringify([
        { number: 1, headRefName: 'claude/issue-42', createdAt: '2026-03-01T00:00:00Z' },
        { number: 2, headRefName: 'claude/issue-43', createdAt: '2026-03-02T00:00:00Z' },
      ]));

      const prs = getOpenClaudePRs('owner/repo');
      expect(prs).toHaveLength(2);
      expect(prs[0].number).toBe(1);
      expect(prs[0].branch).toBe('claude/issue-42');
    });

    it('returns empty array on failure', () => {
      mockExecThrow();
      expect(getOpenClaudePRs('owner/repo')).toEqual([]);
    });
  });

  describe('getPRMergeability', () => {
    it('returns CONFLICTING for merge conflicts', () => {
      mockExec('CONFLICTING');
      expect(getPRMergeability(42, 'owner/repo')).toBe('CONFLICTING');
    });

    it('returns UNKNOWN on failure', () => {
      mockExecThrow();
      expect(getPRMergeability(42, 'owner/repo')).toBe('UNKNOWN');
    });
  });

  describe('getPRCIConclusion', () => {
    it('returns SUCCESS when both test and test-chromium pass', () => {
      mockExec(JSON.stringify([
        { name: 'test', conclusion: 'SUCCESS' },
        { name: 'test-chromium', conclusion: 'SUCCESS' },
      ]));
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('SUCCESS');
    });

    it('returns FAILURE when test-chromium fails (E2E)', () => {
      mockExec(JSON.stringify([
        { name: 'test', conclusion: 'SUCCESS' },
        { name: 'test-chromium', conclusion: 'FAILURE' },
      ]));
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('FAILURE');
    });

    it('returns FAILURE when test fails', () => {
      mockExec(JSON.stringify([
        { name: 'test', conclusion: 'FAILURE' },
        { name: 'test-chromium', conclusion: 'SUCCESS' },
      ]));
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('FAILURE');
    });

    it('returns empty string when only test is present (test-chromium not yet started)', () => {
      mockExec(JSON.stringify([
        { name: 'test', conclusion: 'SUCCESS' },
      ]));
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('');
    });

    it('returns empty string when only test-chromium is present (test not yet started)', () => {
      mockExec(JSON.stringify([
        { name: 'test-chromium', conclusion: 'SUCCESS' },
      ]));
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('');
    });

    it('returns empty string on failure', () => {
      mockExecThrow();
      expect(getPRCIConclusion(42, 'owner/repo')).toBe('');
    });
  });

  describe('countCommentsByContent', () => {
    it('returns count of matching comments', () => {
      mockExec('3');
      expect(countCommentsByContent(42, 'owner/repo', 'failing')).toBe(3);
    });

    it('returns 0 on failure', () => {
      mockExecThrow();
      expect(countCommentsByContent(42, 'owner/repo', 'failing')).toBe(0);
    });
  });

  // ─── Story helpers ───────────────────────────────────────────────

  describe('getInProgressStories', () => {
    it('parses issue numbers', () => {
      mockExec('42\n43\n44');
      expect(getInProgressStories('owner/repo')).toEqual([42, 43, 44]);
    });

    it('returns empty array on failure', () => {
      mockExecThrow();
      expect(getInProgressStories('owner/repo')).toEqual([]);
    });
  });

  describe('findExistingWorkBranch', () => {
    it('finds claude/issue branch', () => {
      mockExecSequence([
        'refs/heads/claude/issue-42-20260319-1234',
        '[]', // no VF runs
      ]);
      expect(findExistingWorkBranch(42, 'owner/repo')).toBe('claude/issue-42-20260319-1234');
    });

    it('falls back to tmp branch when VF runs exist', () => {
      mockExecSequence([
        '',   // no action branches
        JSON.stringify([{ displayTitle: 'Verify #42', conclusion: 'failure', headBranch: 'tmp/x' }]),
        'refs/heads/tmp/vf-issue-42-abc',
      ]);
      expect(findExistingWorkBranch(42, 'owner/repo')).toBe('tmp/vf-issue-42-abc');
    });

    it('returns null when no branches found', () => {
      mockExecSequence(['', '[]']);
      expect(findExistingWorkBranch(42, 'owner/repo')).toBeNull();
    });
  });

  describe('countVFGiveups', () => {
    it('returns count of give-up runs', () => {
      mockExec('2');
      expect(countVFGiveups(42, 'owner/repo')).toBe(2);
    });
  });

  describe('countSuccessfulClaudeRuns', () => {
    it('returns count of successful runs', () => {
      mockExec('3');
      expect(countSuccessfulClaudeRuns(42, 'owner/repo')).toBe(3);
    });
  });

  describe('checkExistingPRForBranch', () => {
    it('returns PR number when found', () => {
      mockExec('99');
      expect(checkExistingPRForBranch(42, 'owner/repo')).toBe(99);
    });

    it('returns null when no PR', () => {
      mockExec('');
      expect(checkExistingPRForBranch(42, 'owner/repo')).toBeNull();
    });

    it('returns null for "null" string', () => {
      mockExec('null');
      expect(checkExistingPRForBranch(42, 'owner/repo')).toBeNull();
    });
  });

  // ─── Epic helpers ────────────────────────────────────────────────

  // Bug: watcher only checked `claude/` branches, missing human-created PRs
  // like `fix/verify-and-fix-pipefail` that also need pipeline monitoring.
  describe('getOpenPRs (all branches, not just claude/)', () => {
    it('returns PRs from all branches including non-claude ones', () => {
      mockExec(JSON.stringify([
        { number: 1, headRefName: 'claude/issue-42', createdAt: '2026-03-01T00:00:00Z' },
        { number: 2, headRefName: 'fix/some-bug', createdAt: '2026-03-02T00:00:00Z' },
      ]));
      const prs = getOpenPRs('owner/repo');
      expect(prs).toHaveLength(2);
      expect(prs[1].branch).toBe('fix/some-bug');
    });
  });

  // Bug: getPRCIConclusion only checked the "test" check, ignoring E2E failures.
  // PRs #488 and #491 had failing E2E but watcher reported CI: SUCCESS.
  describe('getPRCIConclusion includes E2E checks', () => {
    it('should check both test and E2E check conclusions', () => {
      // Read the source to verify it checks more than just "test"
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '../../lib/watcher.ts'), 'utf-8'
      );
      const fnMatch = src.match(/getPRCIConclusion[\s\S]*?^}/m);
      expect(fnMatch, 'getPRCIConclusion function not found').toBeTruthy();
      const fnBody = fnMatch![0];

      // Must check for E2E checks (test-chromium, test-performance, etc), not just "test"
      expect(
        fnBody,
        'getPRCIConclusion must check E2E results, not just the "test" check',
      ).toMatch(/test-chromium|e2e|E2E|statusCheckRollup.*FAILURE/i);
    });
  });

  // Bug: watcher handled conflicts by posting @claude comment, which relies
  // on claude.yml triggering (broken). Should dispatch resolve-conflicts.yml.
  describe('checkPR conflict handling', () => {
    it('dispatches resolve-conflicts instead of posting @claude comment', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '../../lib/watcher.ts'), 'utf-8'
      );
      const checkPRBody = src.match(/export async function checkPR[\s\S]*?^}/m);
      expect(checkPRBody).toBeTruthy();

      // Must NOT contain @claude in the conflict handling section
      const conflictSection = checkPRBody![0].match(/CONFLICTING[\s\S]*?return/);
      expect(conflictSection).toBeTruthy();
      expect(
        conflictSection![0],
        'Conflict handling must dispatch resolve-conflicts.yml, not post @claude',
      ).not.toContain('@claude');
    });
  });

  // Bug: missing CI handler only dispatched test.yml, not e2e-smoke.yml.
  // E2E failures were invisible even after retrigger.
  describe('checkPR missing CI triggers both test and e2e', () => {
    it('dispatches both test.yml and e2e-smoke.yml when CI is missing', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '../../lib/watcher.ts'), 'utf-8'
      );
      const checkPRBody = src.match(/export async function checkPR[\s\S]*?^}/m);
      expect(checkPRBody).toBeTruthy();

      const missingCISection = checkPRBody![0].match(/Missing CI[\s\S]*?retrigger/);
      expect(missingCISection).toBeTruthy();

      expect(
        missingCISection![0],
        'Missing CI handler must dispatch e2e-smoke.yml too',
      ).toContain('e2e-smoke.yml');
    });
  });

  // Improvement: path-based CI skip — if only .github/ files changed,
  // E2E tests don't need to run (pipeline changes don't affect the app).
  describe('getPRChangedPaths', () => {
    it('returns list of changed file paths', () => {
      mockExec('.github/workflows/test.yml\n.github/scripts/lib/watcher.ts\n');
      const paths = getPRChangedPaths(42, 'owner/repo');
      expect(paths).toEqual(['.github/workflows/test.yml', '.github/scripts/lib/watcher.ts']);
    });

    it('returns empty array on failure', () => {
      mockExecThrow();
      expect(getPRChangedPaths(42, 'owner/repo')).toEqual([]);
    });
  });

  // Bug (#499): watcher saw CI passing + 0 approvals + 0 unresolved threads
  // and did nothing. The merge gate handles owner-approval, but the watcher
  // never dispatched auto-merge to let the gate evaluate.
  describe('checkPR dispatches auto-merge when CI passes with no approvals', () => {
    it('watcher dispatches auto-merge for CI-passing PRs without formal approval', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '../../lib/watcher.ts'), 'utf-8'
      );
      const checkPRBody = src.match(/export async function checkPR[\s\S]*?^}/m);
      expect(checkPRBody).toBeTruthy();

      // After the unresolved threads check (approvals === 0, threads resolved),
      // there must be a fallback that dispatches auto-merge
      const ciPassingSection = checkPRBody![0].match(
        /No approvals.*no unresolved|no formal approval|owner-approval/is
      );
      expect(
        ciPassingSection,
        'checkPR must dispatch auto-merge when CI passes with 0 approvals and 0 unresolved threads',
      ).toBeTruthy();
    });
  });

  describe('getOpenEpicLabels', () => {
    it('parses epic labels', () => {
      mockExec('epic:ui-overhaul\nepic:backend-api');
      expect(getOpenEpicLabels('owner/repo')).toEqual(['epic:ui-overhaul', 'epic:backend-api']);
    });

    it('returns empty array on failure', () => {
      mockExecThrow();
      expect(getOpenEpicLabels('owner/repo')).toEqual([]);
    });
  });
});
