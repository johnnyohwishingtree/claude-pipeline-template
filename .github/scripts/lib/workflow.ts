/**
 * Temporal-like activity runner — TypeScript port of workflow.sh.
 *
 * Provides three primitives that every workflow step wraps around:
 *   activityStart   — idempotent guard + lock + state transition
 *   activitySuccess — transition to next state + release lock
 *   activityFail    — increment attempts, retry or escalate
 */

import type { PipelineState, PipelineStateData, ActivityType } from './types.js';
import { ACTIVITY_LIMITS } from './types.js';
import { PipelineStateMachine } from './state-machine.js';
import { GitHubClient } from './github.js';

export interface ActivityContext {
  issueNumber: number;
  activityName: ActivityType;
  lockId: string;
}

export class ActivityRunner {
  private stateMachine: PipelineStateMachine;
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
    this.stateMachine = new PipelineStateMachine(github);
  }

  /**
   * Guard + lock before starting an activity.
   * Returns an ActivityContext if the activity should proceed, or null if it should skip.
   *
   * Port of: activity_start() in workflow.sh
   */
  async activityStart(
    issueNumber: number,
    activityName: ActivityType,
    validFromStates: PipelineState[],
    runId?: string
  ): Promise<ActivityContext | null> {
    if (validFromStates.length === 0) {
      throw new Error('At least one validFromState is required');
    }

    const lockId = `${activityName}-${runId ?? process.pid}`;

    // 1. Read current state
    const currentState = await this.stateMachine.getState(issueNumber);

    // 2. Guard: check if current state is in the valid list
    let stateValid = validFromStates.includes(currentState as PipelineState);

    // Special case: "unknown" (no state yet) is allowed for "implement" activity
    if (currentState === 'unknown' && activityName === 'implement') {
      stateValid = true;
    }

    if (!stateValid) {
      return null;
    }

    // 3. Initialize state if needed (for implement activity on new issues)
    const stateData = await this.stateMachine.readState(issueNumber);
    if (!stateData) {
      await this.stateMachine.transition(issueNumber, 'planned');
    }

    // 4. Acquire lock (idempotent — same lock_id succeeds)
    const locked = await this.stateMachine.acquireLock(issueNumber, lockId);
    if (!locked) {
      return null;
    }

    return { issueNumber, activityName, lockId };
  }

  /**
   * Transition to next state + release lock after successful activity.
   *
   * Port of: activity_success() in workflow.sh
   */
  async activitySuccess(
    ctx: ActivityContext,
    nextState: PipelineState,
    overrides?: Partial<Pick<PipelineStateData, 'prNumber' | 'branches'>>
  ): Promise<PipelineStateData> {
    const result = await this.stateMachine.transition(
      ctx.issueNumber,
      nextState,
      overrides
    );

    await this.stateMachine.releaseLock(ctx.issueNumber, ctx.lockId)
      .catch(() => { /* lock release is best-effort */ });

    return result;
  }

  /**
   * Increment attempt counter, retry or escalate after failed activity.
   *
   * Port of: activity_fail() in workflow.sh
   */
  async activityFail(
    ctx: ActivityContext,
    errorContext: string,
    retry?: {
      workflowFile: string;
      branch: string;
      inputs?: Record<string, string>;
    }
  ): Promise<{ retried: boolean; attempt: number; maxAttempts: number }> {
    const stateData = await this.stateMachine.readState(ctx.issueNumber);
    const attempts = stateData?.attempts?.[ctx.activityName] ?? 0;
    const nextAttempt = attempts + 1;
    const maxAttempts = stateData?.maxAttempts ?? ACTIVITY_LIMITS[ctx.activityName];

    // Update attempt counter and error context in state
    if (stateData) {
      const updated: PipelineStateData = {
        ...stateData,
        attempts: {
          ...(stateData.attempts ?? {}),
          [ctx.activityName]: nextAttempt,
        },
        errorContext,
      };
      await this.stateMachine.writeState(ctx.issueNumber, updated);
    }

    // Release lock before dispatching retry
    await this.stateMachine.releaseLock(ctx.issueNumber, ctx.lockId)
      .catch(() => { /* best-effort */ });

    // Retry or escalate
    if (nextAttempt < maxAttempts) {
      if (retry) {
        await this.github.dispatchWorkflow(
          retry.workflowFile,
          retry.branch,
          retry.inputs
        ).catch(() => { /* dispatch is best-effort */ });
      }
      return { retried: true, attempt: nextAttempt, maxAttempts };
    }

    // Exhausted — escalate
    await this.stateMachine.transition(ctx.issueNumber, 'escalated', {
      errorContext,
    }).catch(() => { /* escalation is best-effort */ });

    return { retried: false, attempt: nextAttempt, maxAttempts };
  }

  /**
   * Get current attempt count for an activity.
   *
   * Port of: activity_get_attempt() in workflow.sh
   */
  async activityGetAttempt(
    issueNumber: number,
    activityName: ActivityType
  ): Promise<number> {
    const stateData = await this.stateMachine.readState(issueNumber);
    return stateData?.attempts?.[activityName] ?? 0;
  }

  /**
   * Reset attempt counter for an activity.
   *
   * Port of: activity_reset_attempts() in workflow.sh
   */
  async activityResetAttempts(
    issueNumber: number,
    activityName: ActivityType
  ): Promise<void> {
    const stateData = await this.stateMachine.readState(issueNumber);
    if (!stateData) return;

    const updated: PipelineStateData = {
      ...stateData,
      attempts: {
        ...(stateData.attempts ?? {}),
        [activityName]: 0,
      },
    };
    await this.stateMachine.writeState(issueNumber, updated);
  }
}
