import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

import { runVerifyChecks } from '../../lib/verify-checks.js';
import type { VerifyChecksOutput } from '../../lib/verify-checks.js';

describe('runVerifyChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress stderr progress output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAllPass(): void {
    mockedExecSync.mockReturnValue('' as never);
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');
  }

  it('returns all-pass when every check succeeds', () => {
    mockAllPass();

    const result = runVerifyChecks({ skipNative: true });

    expect(result.pass).toBe(true);
    expect(result.checks.lint.pass).toBe(true);
    expect(result.checks.typecheck.pass).toBe(true);
    expect(result.checks.bundle.pass).toBe(true);
    expect(result.checks.test.pass).toBe(true);
    expect(result.checks.native_deps.pass).toBe(true);
  });

  describe('lint check', () => {
    it('fails when eslint reports errors', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('eslint')) {
          return 'src/file.ts:1:1 error something no-unused-vars\n\n1 error found';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ skipNative: true });

      expect(result.pass).toBe(false);
      expect(result.checks.lint.pass).toBe(false);
      expect(result.checks.lint.errors).toContain('error');
    });

    it('lints only changed files when lintOnlyChanged is true', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git diff --name-only')) {
          return 'src/file.ts\nsrc/other.ts';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ lintOnlyChanged: true, skipNative: true });

      expect(result.pass).toBe(true);
    });

    it('passes lint when no changed files and lintOnlyChanged is true', () => {
      mockedExecSync.mockReturnValue('' as never);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ lintOnlyChanged: true, skipNative: true });

      expect(result.pass).toBe(true);
      expect(result.checks.lint.pass).toBe(true);
    });
  });

  describe('typecheck', () => {
    it('fails when tsc reports errors', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('typecheck')) {
          return 'src/file.ts(1,1): error TS2304: Cannot find name "foo"';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ skipNative: true });

      expect(result.pass).toBe(false);
      expect(result.checks.typecheck.pass).toBe(false);
      expect(result.checks.typecheck.errors).toContain('error TS2304');
    });
  });

  describe('bundle check', () => {
    it('passes by default (no-op until overridden)', () => {
      mockAllPass();

      const result = runVerifyChecks({ skipNative: true });

      expect(result.checks.bundle.pass).toBe(true);
    });
  });

  describe('tests', () => {
    it('fails when jest reports failures', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('pnpm test')) {
          return 'FAIL src/__tests__/thing.test.ts\n● should work\nExpected: true\nReceived: false';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ skipNative: true });

      expect(result.pass).toBe(false);
      expect(result.checks.test.pass).toBe(false);
      expect(result.checks.test.errors).toContain('FAIL');
    });
  });

  describe('native dependency check', () => {
    it('passes by default (no-op until overridden)', () => {
      mockAllPass();

      const result = runVerifyChecks();

      expect(result.checks.native_deps.pass).toBe(true);
    });

    it('skips native check when skipNative is true', () => {
      mockAllPass();

      const result = runVerifyChecks({ skipNative: true });

      expect(result.checks.native_deps.pass).toBe(true);
    });
  });

  describe('fail-fast mode', () => {
    it('skips subsequent checks after first failure', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('eslint')) {
          return 'src/file.ts:1:1 error bad-thing rule-name';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ failFast: true, skipNative: true });

      expect(result.pass).toBe(false);
      expect(result.checks.lint.pass).toBe(false);
      // Subsequent checks should still show as pass (default) because they were skipped
      expect(result.checks.typecheck.pass).toBe(true);
      expect(result.checks.bundle.pass).toBe(true);
      expect(result.checks.test.pass).toBe(true);
    });
  });

  describe('summary', () => {
    it('includes all failure details in summary', () => {
      mockedExecSync.mockImplementation(((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('eslint')) {
          return 'file.ts:1:1 error lint-issue some-rule';
        }
        if (typeof cmd === 'string' && cmd.includes('typecheck')) {
          return 'file.ts(1,1): error TS1234: type problem';
        }
        return '';
      }) as typeof execSync);
      mockedExistsSync.mockReturnValue(false);
      mockedReadFileSync.mockReturnValue('{"dependencies":{}, "devDependencies":{}}');

      const result = runVerifyChecks({ skipNative: true });

      expect(result.summary).toContain('LINT ERRORS');
      expect(result.summary).toContain('TYPECHECK ERRORS');
    });

    it('has empty summary when all checks pass', () => {
      mockAllPass();

      const result = runVerifyChecks({ skipNative: true });

      expect(result.summary).toBe('');
    });
  });

  describe('output structure', () => {
    it('returns correct VerifyChecksOutput shape', () => {
      mockAllPass();

      const result: VerifyChecksOutput = runVerifyChecks({ skipNative: true });

      expect(result).toHaveProperty('pass');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('summary');
      expect(result.checks).toHaveProperty('lint');
      expect(result.checks).toHaveProperty('typecheck');
      expect(result.checks).toHaveProperty('bundle');
      expect(result.checks).toHaveProperty('test');
      expect(result.checks).toHaveProperty('native_deps');

      for (const check of Object.values(result.checks)) {
        expect(check).toHaveProperty('pass');
        expect(check).toHaveProperty('errors');
      }
    });
  });
});
