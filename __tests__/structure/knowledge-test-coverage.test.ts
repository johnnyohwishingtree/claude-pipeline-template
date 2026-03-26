/**
 * Meta-test: every testable policy has a structural test.
 *
 * Scans .knowledge/policies/ and checks whether each policy is mapped
 * to a structural test. Warns on unmapped policies.
 *
 * See: .knowledge/policies/architecture/testable-architecture.md
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '../..');
const POLICIES_DIR = resolve(ROOT, '.knowledge/policies');
const STRUCTURE_DIR = resolve(ROOT, '__tests__/structure');

/**
 * Policy → test mapping. CUSTOMIZE for your project.
 * Every testable policy must have at least one test listed here.
 */
const POLICY_TEST_MAP: Record<string, string[]> = {
  // CUSTOMIZE: Add your policy → test mappings
  // 'architecture/dependency-direction.md': ['dependency-direction.test.ts'],
};

/**
 * Policies that are design guidelines — not structurally testable.
 * CUSTOMIZE: Add your project's non-testable policies.
 */
const DESIGN_GUIDELINES = new Set<string>([
  // CUSTOMIZE: e.g., 'ui/typography.md', 'ui/motion.md'
]);

function getPolicyFiles(): string[] {
  if (!existsSync(POLICIES_DIR)) return [];
  const files: string[] = [];
  function walk(dir: string, prefix = '') {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${entry}/`);
      } else if (entry.endsWith('.md') && entry !== 'README.md') {
        files.push(`${prefix}${entry}`);
      }
    }
  }
  walk(POLICIES_DIR);
  return files;
}

describe('Knowledge test coverage', () => {
  it('mapped policies have existing test files', () => {
    const missing: string[] = [];
    for (const [policy, tests] of Object.entries(POLICY_TEST_MAP)) {
      for (const test of tests) {
        if (!existsSync(resolve(STRUCTURE_DIR, test))) {
          missing.push(`${policy} → ${test} (missing)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('reports unmapped policies', () => {
    const allKnown = new Set([...Object.keys(POLICY_TEST_MAP), ...DESIGN_GUIDELINES]);
    const policies = getPolicyFiles();

    const unmapped = policies.filter(p => !allKnown.has(p));

    if (unmapped.length > 0) {
      console.warn(`Policies not mapped in knowledge-test-coverage.test.ts:`);
      for (const u of unmapped) {
        console.warn(`  - policies/${u}`);
      }
      console.warn(`Add to POLICY_TEST_MAP or DESIGN_GUIDELINES.`);
    }

    // Warns but doesn't fail — projects add mappings incrementally.
    // To enforce: expect(unmapped).toEqual([]);
  });
});
