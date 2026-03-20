#!/usr/bin/env tsx
/**
 * CLI wrapper for verify-checks — replaces verify-checks.sh.
 *
 * Usage:
 *   npx tsx .github/scripts/lib/cli/verify-checks.ts [--lint-only-changed] [--fail-fast] [--skip-native]
 *
 * Outputs JSON to stdout. Progress messages go to stderr.
 */

import { runVerifyChecks } from '../verify-checks.js';

const args = process.argv.slice(2);

const opts = {
  lintOnlyChanged: args.includes('--lint-only-changed'),
  failFast: args.includes('--fail-fast'),
  skipNative: args.includes('--skip-native'),
};

const result = runVerifyChecks(opts);
console.log(JSON.stringify(result));
process.exit(result.pass ? 0 : 1);
