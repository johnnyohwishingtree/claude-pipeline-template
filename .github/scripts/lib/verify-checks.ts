/**
 * Verification checks — TypeScript port of verify-checks.sh.
 *
 * Runs lint, typecheck, bundle, unit tests, and native dependency checks.
 * Returns structured JSON output.
 */

import { execSync } from 'node:child_process';

export interface CheckResult {
  pass: boolean;
  errors: string;
}

export interface VerifyChecksOutput {
  pass: boolean;
  checks: {
    lint: CheckResult;
    typecheck: CheckResult;
    bundle: CheckResult;
    test: CheckResult;
    native_deps: CheckResult;
  };
  summary: string;
}

export interface VerifyChecksOptions {
  lintOnlyChanged?: boolean;
  failFast?: boolean;
  skipNative?: boolean;
}

function runCmd(cmd: string): { stdout: string; success: boolean } {
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, success: true };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    return { stdout: (error.stdout ?? '') + (error.stderr ?? ''), success: false };
  }
}

function progress(msg: string): void {
  console.error(msg);
}

export function runVerifyChecks(opts: VerifyChecksOptions = {}): VerifyChecksOutput {
  let overallPass = true;
  let summary = '';
  const checks: VerifyChecksOutput['checks'] = {
    lint: { pass: true, errors: '' },
    typecheck: { pass: true, errors: '' },
    bundle: { pass: true, errors: '' },
    test: { pass: true, errors: '' },
    native_deps: { pass: true, errors: '' },
  };

  function recordFailure(check: keyof typeof checks, errors: string, label: string): void {
    overallPass = false;
    checks[check] = { pass: false, errors };
    summary += `\n${label}:\n${errors}`;
  }

  function shouldSkip(): boolean {
    return opts.failFast === true && !overallPass;
  }

  // === Lint ===
  progress('=== Lint ===');
  if (opts.lintOnlyChanged) {
    const { stdout: changedFiles } = runCmd(
      "git diff --name-only origin/master...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null | grep -v node_modules || true"
    );
    if (changedFiles.trim()) {
      const fileCount = changedFiles.trim().split('\n').length;
      progress(`Linting ${fileCount} changed files`);
      const { stdout: lintOut } = runCmd(
        `echo "${changedFiles.trim()}" | xargs -d '\\n' npx eslint --quiet 2>&1`
      );
      if (/error /.test(lintOut)) {
        progress('Lint FAILED');
        const errors = lintOut.split('\n').filter((l) => /error /.test(l)).slice(0, 10).join('\n');
        recordFailure('lint', errors, 'LINT ERRORS');
      } else {
        progress('Lint passed');
      }
    } else {
      progress('No changed JS/TS files to lint');
    }
  } else {
    progress('Linting all files');
    const { stdout: lintOut } = runCmd('npx eslint . --quiet 2>&1');
    if (/error /.test(lintOut)) {
      progress('Lint FAILED');
      const errors = lintOut.split('\n').filter((l) => /error /.test(l)).slice(0, 10).join('\n');
      recordFailure('lint', errors, 'LINT ERRORS');
    } else {
      progress('Lint passed');
    }
  }

  // === Typecheck ===
  progress('=== Typecheck ===');
  if (!shouldSkip()) {
    const { stdout: tcOut } = runCmd('pnpm typecheck 2>&1');
    if (/error TS/.test(tcOut)) {
      progress('Typecheck FAILED');
      const errors = tcOut.split('\n').filter((l) => /error TS/.test(l)).slice(0, 10).join('\n');
      recordFailure('typecheck', errors, 'TYPECHECK ERRORS');
    } else {
      progress('Typecheck passed');
    }
  }

  // === Bundle Check ===
  progress('=== Bundle Check ===');
  if (!shouldSkip()) {
    // Override this section for framework-specific bundle checks (e.g., metro, webpack, vite)
    progress('Bundle check passed (no-op — override for your framework)');
  }

  // === Tests ===
  progress('=== Tests ===');
  if (!shouldSkip()) {
    const { stdout: testOut } = runCmd('pnpm test 2>&1');
    if (/FAIL /.test(testOut)) {
      progress('Tests FAILED');
      const errors = testOut.split('\n')
        .filter((l) => /FAIL |● |Expected|Received/.test(l) && !/● Console/.test(l))
        .slice(0, 20).join('\n');
      recordFailure('test', errors, 'TEST FAILURES');
    } else {
      progress('Tests passed');
    }
  }

  // === Native Dependency Check ===
  progress('=== Native Dependency Check ===');
  if (!opts.skipNative && !shouldSkip()) {
    // Override this section for platform-specific dependency checks
    progress('Native dependency check passed (no-op — override for your platform)');
  }

  return { pass: overallPass, checks, summary: summary.trim() };
}
