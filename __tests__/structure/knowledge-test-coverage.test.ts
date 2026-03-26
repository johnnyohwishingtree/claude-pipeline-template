/**
 * Meta-test: every testable .knowledge/ convention has a structural test.
 *
 * Scans .knowledge/conventions/ for files and checks whether a matching
 * structural test exists in __tests__/structure/. Flags conventions that
 * are testable but have no enforcement.
 *
 * This is a starter test from the claude-pipeline-template. Customize the
 * DESIGN_GUIDELINES set for your project's non-testable conventions.
 */

import { readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '../..');
const CONVENTIONS_DIR = resolve(ROOT, '.knowledge/conventions');
const STRUCTURE_TESTS_DIR = resolve(ROOT, '__tests__/structure');

/**
 * Conventions that are design guidelines and can't be structurally tested.
 * Add your project's non-testable conventions here.
 */
const DESIGN_GUIDELINES = new Set([
  // CUSTOMIZE: Add convention filenames that are design guidelines
  // e.g., 'typography.md', 'motion.md', 'ux-writing.md'
]);

function getConventionFiles(): string[] {
  if (!existsSync(CONVENTIONS_DIR)) return [];
  const files: string[] = [];

  function walk(dir: string, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
        files.push(`${prefix}${entry.name}`);
      }
    }
  }
  walk(CONVENTIONS_DIR);
  return files;
}

function getStructuralTests(): string[] {
  if (!existsSync(STRUCTURE_TESTS_DIR)) return [];
  return readdirSync(STRUCTURE_TESTS_DIR)
    .filter(f => f.endsWith('.test.ts'));
}

describe('Knowledge test coverage', () => {
  it('lists conventions and their test coverage', () => {
    const conventions = getConventionFiles();
    const tests = getStructuralTests();

    const untested: string[] = [];
    const tested: string[] = [];
    const guidelines: string[] = [];

    for (const conv of conventions) {
      if (DESIGN_GUIDELINES.has(conv)) {
        guidelines.push(conv);
        continue;
      }

      // Check if any structural test name relates to this convention
      const baseName = conv.replace('.md', '').replace(/\//g, '-');
      const hasTest = tests.some(t =>
        t.includes(baseName) ||
        baseName.split('-').some(part => part.length > 3 && t.includes(part))
      );

      if (hasTest) {
        tested.push(conv);
      } else {
        untested.push(conv);
      }
    }

    // Report coverage
    console.log(`Knowledge test coverage:`);
    console.log(`  Tested: ${tested.length}`);
    console.log(`  Untested: ${untested.length}`);
    console.log(`  Design guidelines (skipped): ${guidelines.length}`);

    if (untested.length > 0) {
      console.warn(`\nConventions without structural tests:`);
      for (const u of untested) {
        console.warn(`  - .knowledge/conventions/${u}`);
      }
      console.warn(`\nAdd tests to __tests__/structure/ or mark as design guidelines.`);
    }

    // This test warns but doesn't fail — projects add tests incrementally.
    // To enforce full coverage, change this to:
    // expect(untested).toEqual([]);
  });
});
