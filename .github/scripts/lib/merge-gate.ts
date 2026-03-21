/**
 * Merge gate evaluator — TypeScript port of evaluate-merge-gate.sh.
 *
 * Evaluates 5 merge conditions and returns an action:
 * - All pass + up to date → merge (squash)
 * - All pass + behind → update branch
 * - Any fail → wait (re-evaluated on next event)
 * - PR doesn't target master → skip
 */

import { GitHubClient } from './github.js';
import type { MergeGateResult } from './types.js';

export async function evaluateMergeGate(
  github: GitHubClient,
  prNumber: number
): Promise<MergeGateResult> {
  const pr = await github.getPR(prNumber);
  const sha = pr.head.sha;

  // Condition 1-2: CI status
  const ci = await github.checkCIStatus(sha);

  // Condition 3: Approved
  // In personal repos, the owner's GITHUB_TOKEN and GH_PAT cannot approve
  // their own PRs (GitHub returns 422 "Can not approve your own pull request").
  // Treat owner-authored PRs as implicitly approved.
  const approvals = await github.countApprovals(prNumber);
  const prAuthor = (pr as any).user?.login;
  const isOwnerPR = prAuthor && prAuthor === github.owner;
  const approved = approvals >= 1 || isOwnerPR;

  // Condition 4: All review threads resolved
  const unresolvedThreads = await github.countUnresolvedThreads(prNumber);
  const threadsResolved = unresolvedThreads === 0;

  // Condition 5: No active review-fix runs
  let noActiveReviewFix = false;
  try {
    noActiveReviewFix = !(await github.isWorkflowActive(
      'review-fix.yml',
      prNumber
    ));
  } catch (error) {
    console.error('Error checking review-fix workflow status:', error);
    // Default to false (block merge) so a transient API failure doesn't
    // accidentally allow a merge while a review-fix run may still be active.
  }

  // Condition 6: Branch up to date with master
  const comparison = await github.compareBranches('master', pr.head.ref);
  const branchUpToDate = comparison !== 'behind' && comparison !== 'diverged';

  const conditions = {
    testsPass: ci.testsPass,
    approved,
    threadsResolved,
    noActiveReviewFix,
    branchUpToDate,
  };

  const failingConditions = Object.entries(conditions)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const allConditionsMet = failingConditions.length === 0;
  const allExceptBranch =
    failingConditions.length === 1 &&
    failingConditions[0] === 'branchUpToDate';

  let action: MergeGateResult['action'];
  if (allConditionsMet) {
    action = 'merge';
  } else if (allExceptBranch) {
    action = 'update_branch';
  } else {
    action = 'wait';
  }

  return { action, conditions, failingConditions };
}
