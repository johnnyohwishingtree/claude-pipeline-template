import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import {
  getIssueContext,
  getRelatedPRNumbers,
  getPRReadiness,
  getRelatedBranches,
  findBestWorkBranch,
  getWorkBranchAnalysis,
  getRelatedPRs,
  discoverRunIds,
  getRunEvidence,
  getPreviousDoctorRuns,
  getPreviousDiagnosticIssues,
  getWorkflowYAMLs,
  KNOWN_BUG_PATTERNS,
  collectEvidence,
} from '../../lib/doctor.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockReturnValue(''),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
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

describe('doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec('');
  });

  // ─── Issue context ──────────────────────────────────────────────

  describe('getIssueContext', () => {
    it('parses issue data', () => {
      mockExec(JSON.stringify({
        title: 'Fix login bug',
        state: 'OPEN',
        labels: [{ name: 'story' }, { name: 'epic:auth' }],
        body: 'This is the issue body\nLine 2',
        comments: [
          { author: { login: 'bot' }, createdAt: '2026-03-01', body: 'Claude fix attempt 1' },
          { author: { login: 'user' }, createdAt: '2026-03-02', body: 'Not pipeline related' },
        ],
      }));

      const ctx = getIssueContext(42, 'owner/repo');
      expect(ctx.title).toBe('Fix login bug');
      expect(ctx.state).toBe('OPEN');
      expect(ctx.labels).toBe('story, epic:auth');
      expect(ctx.body).toContain('issue body');
      expect(ctx.pipelineComments).toContain('Claude fix attempt');
    });

    it('handles missing data gracefully', () => {
      mockExecThrow();
      const ctx = getIssueContext(42, 'owner/repo');
      expect(ctx.title).toBe('unknown');
      expect(ctx.state).toBe('unknown');
    });
  });

  // ─── PR merge readiness ─────────────────────────────────────────

  describe('getRelatedPRNumbers', () => {
    it('finds PRs by branch name pattern', () => {
      mockExec(JSON.stringify([
        { number: 10, headRefName: 'claude/issue-42-20260319', body: '' },
        { number: 11, headRefName: 'feat/unrelated', body: '' },
        { number: 12, headRefName: 'feat/other', body: 'Closes #42' },
      ]));
      const prs = getRelatedPRNumbers(42, 'owner/repo');
      expect(prs).toContain(10);
      expect(prs).toContain(12);
      expect(prs).not.toContain(11);
    });

    it('returns empty on failure', () => {
      mockExecThrow();
      expect(getRelatedPRNumbers(42, 'owner/repo')).toEqual([]);
    });
  });

  describe('getPRReadiness', () => {
    it('collects all readiness fields', () => {
      mockExecSequence(['2', '1', 'test: SUCCESS, lint: SUCCESS', 'MERGEABLE', 'failure at 2026-03-01']);
      const r = getPRReadiness(10, 'owner/repo');
      expect(r.prNumber).toBe(10);
      expect(r.approvals).toBe('2');
      expect(r.unresolvedThreads).toBe('1');
      expect(r.ciChecks).toContain('SUCCESS');
      expect(r.mergeable).toBe('MERGEABLE');
      expect(r.reviewFixRuns).toContain('failure');
    });
  });

  // ─── Branches ───────────────────────────────────────────────────

  describe('findBestWorkBranch', () => {
    it('finds branch with most commits ahead', () => {
      mockExecSequence([
        'origin/claude/issue-42-a\norigin/claude/issue-42-b', // for-each-ref
        '3',  // ahead for -a
        '7',  // ahead for -b
        '',   // second pattern returns nothing
      ]);
      const best = findBestWorkBranch(42);
      expect(best).not.toBeNull();
      expect(best!.branch).toBe('claude/issue-42-b');
      expect(best!.ahead).toBe(7);
    });

    it('returns null when no branches found', () => {
      mockExec('');
      expect(findBestWorkBranch(42)).toBeNull();
    });
  });

  describe('getWorkBranchAnalysis', () => {
    it('includes commit log and diff sections', () => {
      mockExecSequence([
        'abc1234 first commit\ndef5678 second commit', // log
        '2 files changed', // diff --stat
        'src/foo.ts\nsrc/bar.ts', // diff --name-only
        '+added line', // diff for foo.ts
        '-removed line', // diff for bar.ts
      ]);
      const analysis = getWorkBranchAnalysis('claude/issue-42', 5);
      expect(analysis).toContain('5 commits');
      expect(analysis).toContain('Commit log');
      expect(analysis).toContain('Files changed');
      expect(analysis).toContain('Key diffs');
    });
  });

  // ─── Related PRs ───────────────────────────────────────────────

  describe('getRelatedPRs', () => {
    it('formats PR list', () => {
      mockExec('{"number":10,"headRefName":"claude/issue-42","state":"OPEN","title":"Fix bug","url":"https://github.com/o/r/pull/10"}');
      const result = getRelatedPRs(42, 'owner/repo');
      expect(result).toContain('#10');
      expect(result).toContain('OPEN');
    });

    it('returns fallback on failure', () => {
      mockExecThrow();
      expect(getRelatedPRs(42, 'owner/repo')).toBe('(no related PRs found)');
    });
  });

  // ─── Failed workflow runs ──────────────────────────────────────

  describe('discoverRunIds', () => {
    it('combines input IDs with auto-discovered ones', () => {
      mockExecSequence([
        '100\n101', // verify-and-fix runs
        '200',      // claude.yml runs
      ]);
      const ids = discoverRunIds(42, 'owner/repo', '50,51');
      expect(ids).toContain('50');
      expect(ids).toContain('51');
      expect(ids).toContain('100');
      expect(ids).toContain('101');
      expect(ids).toContain('200');
    });

    it('deduplicates IDs', () => {
      mockExecSequence([
        '100', // verify-and-fix
        '100', // claude.yml (same)
      ]);
      const ids = discoverRunIds(42, 'owner/repo', '100');
      expect(ids.filter(id => id === '100')).toHaveLength(1);
    });

    it('handles empty input', () => {
      mockExecSequence(['', '']);
      const ids = discoverRunIds(42, 'owner/repo', '');
      expect(ids).toEqual([]);
    });
  });

  describe('getRunEvidence', () => {
    it('parses run data and failed logs', () => {
      mockExecSequence([
        JSON.stringify({ name: 'verify-and-fix', displayTitle: 'Verify #42', conclusion: 'failure', createdAt: '2026-03-01' }),
        'Error: test failed\nat line 42',
      ]);
      const ev = getRunEvidence('100', 'owner/repo');
      expect(ev.name).toBe('verify-and-fix');
      expect(ev.conclusion).toBe('failure');
      expect(ev.failedLog).toContain('test failed');
    });
  });

  // ─── Previous doctor runs ─────────────────────────────────────

  describe('getPreviousDoctorRuns', () => {
    it('returns first-diagnosis message when no runs', () => {
      mockExec('');
      expect(getPreviousDoctorRuns(42, 'owner/repo')).toContain('first diagnosis');
    });

    it('lists previous runs when found', () => {
      mockExecSequence([
        '{"databaseId":500,"conclusion":"failure","createdAt":"2026-03-01"}',
        'some log output', // previous run logs
      ]);
      const result = getPreviousDoctorRuns(42, 'owner/repo');
      expect(result).toContain('DIFFERENT approach');
      expect(result).toContain('500');
    });
  });

  describe('getPreviousDiagnosticIssues', () => {
    it('returns formatted list', () => {
      mockExec('- [Stuck pipeline](https://...) (OPEN)');
      expect(getPreviousDiagnosticIssues('owner/repo')).toContain('Stuck pipeline');
    });

    it('returns fallback on failure', () => {
      mockExecThrow();
      expect(getPreviousDiagnosticIssues('owner/repo')).toBe('(none)');
    });
  });

  // ─── Workflow YAMLs ────────────────────────────────────────────

  describe('getWorkflowYAMLs', () => {
    it('includes existing workflow files', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('name: Test\non: push');

      const result = getWorkflowYAMLs('/path/to/workflows', ['test.yml']);
      expect(result).toContain('test.yml');
      expect(result).toContain('name: Test');
    });

    it('skips non-existent files', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const result = getWorkflowYAMLs('/path/to/workflows', ['missing.yml']);
      expect(result).toBe('');
    });
  });

  // ─── Known bug patterns ───────────────────────────────────────

  describe('KNOWN_BUG_PATTERNS', () => {
    it('contains all 10 patterns', () => {
      expect(KNOWN_BUG_PATTERNS).toContain('Missing allowedTools');
      expect(KNOWN_BUG_PATTERNS).toContain('Stale test assertions');
      expect(KNOWN_BUG_PATTERNS).toContain('Workflow version mismatch');
    });
  });

  // ─── Full evidence collection ─────────────────────────────────

  describe('collectEvidence', () => {
    it('returns evidence string with all sections', () => {
      // Mock all the gh calls in sequence
      mockExecSequence([
        // getIssueContext
        JSON.stringify({ title: 'Test', state: 'OPEN', labels: [], body: 'body', comments: [] }),
        // getRelatedPRNumbers
        '[]',
        // getRelatedBranches (3 patterns)
        '', '', '',
        // findBestWorkBranch (2 patterns)
        '', '',
        // getRelatedPRs
        '',
        // discoverRunIds (2 calls)
        '', '',
        // getPreviousDoctorRuns
        '',
        // getPreviousDiagnosticIssues
        '(none)',
      ]);

      const { evidence, workBranch } = collectEvidence({
        issueNum: 42,
        repo: 'owner/repo',
        failedRunIds: '',
        workflowDir: '/tmp/workflows',
      });

      expect(evidence).toContain('Issue #42');
      expect(evidence).toContain('PR Merge Readiness');
      expect(evidence).toContain('Branches');
      expect(evidence).toContain('Failed Workflow Runs');
      expect(evidence).toContain('Known Pipeline Bug Patterns');
      expect(workBranch).toBeNull();
    });
  });
});
