/**
 * GitHub API client — TypeScript port of lib.sh functions.
 *
 * Uses Octokit for REST and GraphQL operations. Every function from lib.sh
 * that touches the GitHub API has a typed equivalent here.
 */

import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import type { CIStatus, ReviewFeedback } from './types.js';

export interface GitHubClientConfig {
  token: string;
  repo: string; // "owner/repo"
}

export class GitHubClient {
  private octokit: Octokit;
  private graphqlClient: typeof graphql;
  readonly owner: string;
  readonly repo: string;

  constructor(config: GitHubClientConfig) {
    const [owner, repo] = config.repo.split('/');
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: config.token });
    this.graphqlClient = graphql.defaults({
      headers: { authorization: `token ${config.token}` },
    });
  }

  // ─── CI Status (port of check_ci_status) ────────────────────────────────

  async checkCIStatus(sha: string): Promise<CIStatus> {
    const { data } = await this.octokit.checks.listForRef({
      owner: this.owner,
      repo: this.repo,
      ref: sha,
    });

    const runs = data.check_runs;

    const testsPass = runs.some(
      (r) => r.name === 'test' && r.conclusion === 'success'
    );

    const e2eChromium = runs.some(
      (r) => r.name === 'test-chromium' && r.conclusion === 'success'
    );
    const e2ePerf = runs.some(
      (r) => r.name === 'test-performance' && r.conclusion === 'success'
    );
    const e2eCross = runs.some(
      (r) => r.name === 'test-cross-browser' && r.conclusion === 'success'
    );
    const e2ePass = e2eChromium && e2ePerf && e2eCross;

    return { testsPass, e2ePass };
  }

  // ─── PR Queries (ports of count_approvals, count_unresolved_threads) ────

  async countApprovals(prNumber: number): Promise<number> {
    const { data } = await this.octokit.pulls.listReviews({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data.filter((r) => r.state === 'APPROVED').length;
  }

  async countUnresolvedThreads(prNumber: number): Promise<number> {
    const result = await this.graphqlClient<{
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: Array<{ isResolved: boolean }>;
          };
        };
      };
    }>(
      `query($owner: String!, $name: String!, $pr: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $pr) {
            reviewThreads(first: 100) {
              nodes { isResolved }
            }
          }
        }
      }`,
      { owner: this.owner, name: this.repo, pr: prNumber }
    );

    const threads =
      result.repository.pullRequest.reviewThreads.nodes;
    return threads.filter((t) => !t.isResolved).length;
  }

  async resolveAllThreads(prNumber: number): Promise<number> {
    const result = await this.graphqlClient<{
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: Array<{ id: string; isResolved: boolean }>;
          };
        };
      };
    }>(
      `query($owner: String!, $name: String!, $pr: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $pr) {
            reviewThreads(first: 100) {
              nodes { id isResolved }
            }
          }
        }
      }`,
      { owner: this.owner, name: this.repo, pr: prNumber }
    );

    const unresolved =
      result.repository.pullRequest.reviewThreads.nodes.filter(
        (t) => !t.isResolved
      );

    for (const thread of unresolved) {
      await this.graphqlClient(
        `mutation($threadId: ID!) {
          resolveReviewThread(input: {threadId: $threadId}) {
            thread { isResolved }
          }
        }`,
        { threadId: thread.id }
      );
    }

    return unresolved.length;
  }

  // ─── PR Operations ─────────────────────────────────────────────────────

  async getPR(prNumber: number) {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  async mergePR(prNumber: number, method: 'squash' | 'merge' | 'rebase' = 'squash') {
    await this.octokit.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      merge_method: method,
    });
  }

  async updateBranch(prNumber: number) {
    await this.octokit.pulls.updateBranch({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
  }

  async approvePR(prNumber: number, body: string) {
    await this.octokit.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      event: 'APPROVE',
      body,
    });
  }

  async getLinkedIssueFromPR(prNumber: number): Promise<number | null> {
    const pr = await this.getPR(prNumber);
    const body = pr.body ?? '';
    const match = body.match(/Closes\s+#(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // ─── Issue Operations (ports of comment_on_issue, get_next_pending_story) ─

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async getIssueComments(issueNumber: number) {
    const { data } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    return data;
  }

  async updateComment(commentId: number, body: string): Promise<void> {
    await this.octokit.issues.updateComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
      body,
    });
  }

  async getIssue(issueNumber: number) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  async getIssueLabels(issueNumber: number): Promise<string[]> {
    const issue = await this.getIssue(issueNumber);
    return issue.labels
      .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
      .filter(Boolean);
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch {
      // Label might not exist — that's fine
    }
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: 'closed',
    });
  }

  async getNextPendingStory(epicLabel: string): Promise<number | null> {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels: `story,pending,${epicLabel}`,
      state: 'open',
      sort: 'created',
      direction: 'asc',
    });
    return data.length > 0 ? data[0].number : null;
  }

  // ─── Review Feedback (port of review-relay logic) ───────────────────────

  async getPRReviewComments(prNumber: number): Promise<ReviewFeedback[]> {
    const { data: reviews } = await this.octokit.pulls.listReviews({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    const feedbacks: ReviewFeedback[] = [];

    for (const review of reviews) {
      const { data: comments } = await this.octokit.pulls.listCommentsForReview(
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          review_id: review.id,
        }
      );

      feedbacks.push({
        prNumber,
        reviewer: review.user?.login ?? 'unknown',
        body: review.body ?? '',
        inlineComments: comments.map((c) => ({
          path: c.path,
          line: c.line ?? c.original_line ?? 0,
          body: c.body,
        })),
        state: review.state as ReviewFeedback['state'],
      });
    }

    return feedbacks;
  }

  async countCriticalComments(prNumber: number): Promise<number> {
    const { data: comments } = await this.octokit.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    const criticalPattern =
      /!\[(critical|high)\]|critical|security-high|high-priority/i;
    return comments.filter((c) => criticalPattern.test(c.body)).length;
  }

  // ─── Workflow Status (port of is_workflow_active) ───────────────────────

  async isWorkflowActive(
    workflowFile: string,
    issueNumber: number
  ): Promise<boolean> {
    const { data: runs } = await this.octokit.actions.listWorkflowRuns({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowFile,
      status: 'in_progress',
    });

    const active = runs.workflow_runs.some((r) =>
      r.display_title?.includes(`#${issueNumber}`)
    );
    if (active) return true;

    const { data: queued } = await this.octokit.actions.listWorkflowRuns({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowFile,
      status: 'queued',
    });

    return queued.workflow_runs.some((r) =>
      r.display_title?.includes(`#${issueNumber}`)
    );
  }

  /**
   * Count all active (in_progress + queued) runs for a workflow,
   * regardless of issue number. Used by the watcher for global
   * agent concurrency checks.
   */
  async countActiveWorkflowRuns(workflowFile: string): Promise<number> {
    const [inProgress, queued] = await Promise.all([
      this.octokit.actions.listWorkflowRuns({
        owner: this.owner,
        repo: this.repo,
        workflow_id: workflowFile,
        status: 'in_progress',
      }),
      this.octokit.actions.listWorkflowRuns({
        owner: this.owner,
        repo: this.repo,
        workflow_id: workflowFile,
        status: 'queued',
      }),
    ]);
    return inProgress.data.total_count + queued.data.total_count;
  }

  // ─── Branch / Commit Queries ────────────────────────────────────────────

  async getHeadSha(branch: string): Promise<string> {
    const { data } = await this.octokit.repos.getBranch({
      owner: this.owner,
      repo: this.repo,
      branch,
    });
    return data.commit.sha;
  }

  async dispatchWorkflow(
    workflowFile: string,
    branch: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    await this.octokit.actions.createWorkflowDispatch({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowFile,
      ref: branch,
      inputs,
    });
  }

  // ─── Trigger Agent (port of trigger_story_agent) ────────────────────────

  async triggerStoryAgent(
    issueNumber: number,
    agent: 'claude' | 'gemini' = 'claude',
    suffix?: string
  ): Promise<void> {
    let body = `@${agent} Implement this story. Read CLAUDE.md for project context and follow the skill referenced in this issue. IMPORTANT: After completing each acceptance criterion, git add, git commit, and git push before moving on. Run tests before your final commit. Create a PR with 'Closes #${issueNumber}' in the body when done.`;

    if (suffix) {
      body += ` ${suffix}`;
    }

    await this.commentOnIssue(issueNumber, body);
  }

  // ─── Count Fix Attempts (port of count_fix_attempts) ───────────────────

  async countFixAttempts(
    issueNumber: number,
    pattern: RegExp
  ): Promise<number> {
    const { data: comments } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });

    return comments.filter((c) => pattern.test(c.body ?? '')).length;
  }

  // ─── Open PRs Query ────────────────────────────────────────────────────

  async listOpenPRs(headPrefix?: string) {
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      per_page: 100,
    });

    if (headPrefix) {
      return data.filter((pr) => pr.head.ref.startsWith(headPrefix));
    }
    return data;
  }

  // ─── Branch Comparison ─────────────────────────────────────────────────

  async compareBranches(
    base: string,
    head: string
  ): Promise<'ahead' | 'behind' | 'diverged' | 'identical'> {
    const { data } = await this.octokit.repos.compareCommits({
      owner: this.owner,
      repo: this.repo,
      base,
      head,
    });
    return data.status;
  }
}
