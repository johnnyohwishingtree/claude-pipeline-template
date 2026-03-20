import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';

// Mock child_process before importing the module
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs for mergeMasterIntoBranch's GITHUB_ENV writing
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

// Import after mocking
import { setupGitAuth, mergeMasterIntoBranch, checkChangesAndCommit, smartPush } from '../../lib/git.js';

describe('git operations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockedExecSync.mockReturnValue('' as never);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('setupGitAuth', () => {
    it('configures git remote and user identity from env', () => {
      process.env['GH_TOKEN'] = 'test-token';
      process.env['GITHUB_REPOSITORY'] = 'owner/repo';

      setupGitAuth();

      expect(mockedExecSync).toHaveBeenCalledWith(
        'git remote set-url origin "https://x-access-token:test-token@github.com/owner/repo.git"',
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git config user.name "Claude CI"',
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git config user.email "claude-ci@users.noreply.github.com"',
        expect.any(Object)
      );
    });

    it('prefers GH_TOKEN over GH_PAT', () => {
      process.env['GH_TOKEN'] = 'token-from-gh-token';
      process.env['GH_PAT'] = 'token-from-gh-pat';
      process.env['GITHUB_REPOSITORY'] = 'owner/repo';

      setupGitAuth();

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('token-from-gh-token'),
        expect.any(Object)
      );
    });

    it('falls back to GH_PAT when GH_TOKEN is missing', () => {
      delete process.env['GH_TOKEN'];
      process.env['GH_PAT'] = 'token-from-pat';
      process.env['GITHUB_REPOSITORY'] = 'owner/repo';

      setupGitAuth();

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('token-from-pat'),
        expect.any(Object)
      );
    });

    it('uses custom user name/email from env', () => {
      process.env['GH_TOKEN'] = 'tok';
      process.env['GITHUB_REPOSITORY'] = 'owner/repo';
      process.env['GIT_USER_NAME'] = 'Custom Bot';
      process.env['GIT_USER_EMAIL'] = 'bot@example.com';

      setupGitAuth();

      expect(mockedExecSync).toHaveBeenCalledWith(
        'git config user.name "Custom Bot"',
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git config user.email "bot@example.com"',
        expect.any(Object)
      );
    });

    it('accepts explicit opts overriding env', () => {
      process.env['GH_TOKEN'] = 'env-token';
      process.env['GITHUB_REPOSITORY'] = 'env/repo';

      setupGitAuth({
        token: 'opt-token',
        repo: 'opt/repo',
        userName: 'Opt User',
        userEmail: 'opt@user.com',
      });

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('opt-token'),
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('opt/repo'),
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git config user.name "Opt User"',
        expect.any(Object)
      );
    });

    it('throws if no token available', () => {
      delete process.env['GH_TOKEN'];
      delete process.env['GH_PAT'];
      process.env['GITHUB_REPOSITORY'] = 'owner/repo';

      expect(() => setupGitAuth()).toThrow('GH_TOKEN or GH_PAT is required');
    });

    it('throws if no repo available', () => {
      process.env['GH_TOKEN'] = 'tok';
      delete process.env['GITHUB_REPOSITORY'];

      expect(() => setupGitAuth()).toThrow('GITHUB_REPOSITORY is required');
    });
  });

  describe('mergeMasterIntoBranch', () => {
    it('returns true on successful merge', () => {
      mockedExecSync.mockReturnValue('' as never);

      const result = mergeMasterIntoBranch();

      expect(result).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git fetch origin master',
        expect.any(Object)
      );
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git merge origin/master --no-edit',
        expect.any(Object)
      );
    });

    it('returns false and aborts on merge conflict', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockImplementationOnce(() => { throw new Error('merge conflict'); }) // git merge
        .mockReturnValueOnce('' as never); // git merge --abort

      const result = mergeMasterIntoBranch();

      expect(result).toBe(false);
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git merge --abort',
        expect.any(Object)
      );
    });

    it('does not throw when merge conflict occurs with GITHUB_ENV set', () => {
      process.env['GITHUB_ENV'] = '/tmp/github-env';

      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockImplementationOnce(() => { throw new Error('conflict'); }) // git merge
        .mockReturnValueOnce('' as never); // git merge --abort

      // Should not throw — gracefully handles conflict + env writing
      const result = mergeMasterIntoBranch();
      expect(result).toBe(false);
    });
  });

  describe('checkChangesAndCommit', () => {
    it('returns false when no changes', () => {
      mockedExecSync.mockReturnValue('' as never);

      const result = checkChangesAndCommit('test message');

      expect(result).toBe(false);
    });

    it('returns false when only output.txt changed', () => {
      mockedExecSync.mockReturnValueOnce('?? output.txt' as never);

      const result = checkChangesAndCommit('test message');

      expect(result).toBe(false);
    });

    it('commits when there are real changes', () => {
      mockedExecSync
        .mockReturnValueOnce(' M src/file.ts' as never) // git status --porcelain
        .mockReturnValueOnce('' as never) // git add -u
        .mockReturnValueOnce('src/file.ts' as never) // git diff --cached --name-only
        .mockReturnValueOnce('' as never); // git commit

      const result = checkChangesAndCommit('fix: something');

      expect(result).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git commit -F -',
        expect.objectContaining({ input: expect.stringContaining('fix: something') })
      );
    });

    it('includes co-author in commit message', () => {
      mockedExecSync
        .mockReturnValueOnce(' M file.ts' as never)
        .mockReturnValueOnce('' as never) // git add -u
        .mockReturnValueOnce('file.ts' as never) // git diff --cached
        .mockReturnValueOnce('' as never); // git commit

      checkChangesAndCommit('msg', 'Bot <bot@test.com>');

      expect(mockedExecSync).toHaveBeenCalledWith(
        'git commit -F -',
        expect.objectContaining({ input: expect.stringContaining('Co-authored-by: Bot <bot@test.com>') })
      );
    });

    it('uses default co-author when none provided', () => {
      mockedExecSync
        .mockReturnValueOnce(' M file.ts' as never)
        .mockReturnValueOnce('' as never)
        .mockReturnValueOnce('file.ts' as never)
        .mockReturnValueOnce('' as never);

      checkChangesAndCommit('msg');

      expect(mockedExecSync).toHaveBeenCalledWith(
        'git commit -F -',
        expect.objectContaining({ input: expect.stringContaining('Co-authored-by: Claude <noreply@anthropic.com>') })
      );
    });

    it('returns false when git add -u produces no staged files', () => {
      mockedExecSync
        .mockReturnValueOnce(' M file.ts' as never) // git status --porcelain
        .mockReturnValueOnce('' as never) // git add -u
        .mockReturnValueOnce('' as never); // git diff --cached --name-only (empty)

      const result = checkChangesAndCommit('msg');

      expect(result).toBe(false);
    });
  });

  describe('smartPush', () => {
    it('pushes when local differs from remote', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockReturnValueOnce('abc123' as never) // git rev-parse HEAD
        .mockReturnValueOnce('def456' as never) // git rev-parse origin/branch
        .mockReturnValueOnce('' as never) // git pull --rebase
        .mockReturnValueOnce('' as never); // git push

      const result = smartPush('my-branch');

      expect(result).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith(
        'git push origin "HEAD:refs/heads/my-branch"',
        expect.any(Object)
      );
    });

    it('skips push when local matches remote', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockReturnValueOnce('abc123' as never) // git rev-parse HEAD
        .mockReturnValueOnce('abc123' as never); // git rev-parse origin/branch

      const result = smartPush('my-branch');

      expect(result).toBe(true);
      // Should not have a git push call
      expect(mockedExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining('git push'),
        expect.any(Object)
      );
    });

    it('skips when pre-push head matches both local and remote', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockReturnValueOnce('abc123' as never) // git rev-parse HEAD
        .mockReturnValueOnce('abc123' as never); // git rev-parse origin/branch

      const result = smartPush('my-branch', 'abc123');

      expect(result).toBe(true);
    });

    it('pushes when pre-push head differs from local', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch
        .mockReturnValueOnce('new-sha' as never) // git rev-parse HEAD
        .mockReturnValueOnce('abc123' as never) // git rev-parse origin/branch
        .mockReturnValueOnce('' as never) // git pull --rebase
        .mockReturnValueOnce('' as never); // git push

      const result = smartPush('my-branch', 'abc123');

      expect(result).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git push'),
        expect.any(Object)
      );
    });

    it('rejects branch names with shell metacharacters', () => {
      expect(() => smartPush('main"; rm -rf /')).toThrow('Invalid branch name');
      expect(() => smartPush('branch$(whoami)')).toThrow('Invalid branch name');
      expect(() => smartPush('branch`cmd`')).toThrow('Invalid branch name');
    });

    it('handles missing remote branch gracefully', () => {
      mockedExecSync
        .mockReturnValueOnce('' as never) // git fetch (allowFailure)
        .mockReturnValueOnce('abc123' as never) // git rev-parse HEAD
        .mockImplementationOnce(() => { throw new Error('not found'); }) // git rev-parse origin/branch fails
        .mockReturnValueOnce('' as never) // git pull --rebase
        .mockReturnValueOnce('' as never); // git push

      const result = smartPush('new-branch');

      expect(result).toBe(true);
    });
  });
});
