/**
 * Pipeline state machine — TypeScript port of state-machine.sh.
 *
 * State is persisted in GitHub issue comments (same format as the shell version)
 * for backward compatibility. The state machine validates transitions and manages
 * locks identically to the bash implementation.
 */

import type { PipelineState, PipelineStateData } from './types.js';
import { PIPELINE_STATES, STATE_TRANSITIONS } from './types.js';
import { GitHubClient } from './github.js';

const STATE_MARKER = '<!-- pipeline-state -->';

export class PipelineStateMachine {
  constructor(private github: GitHubClient) {}

  // ─── Read / Write ───────────────────────────────────────────────────────

  async readState(issueNumber: number): Promise<PipelineStateData | null> {
    const comments = await this.github
      .getIssueComments(issueNumber)
      .catch(() => []);

    // Find the state comment (last one with our marker)
    const stateComment = [...comments]
      .reverse()
      .find((c) => c.body?.includes(STATE_MARKER));

    if (!stateComment?.body) return null;

    // Extract JSON from ```json ... ``` block
    const match = stateComment.body.match(/```json\n([\s\S]*?)\n```/);
    if (!match) return null;

    try {
      return JSON.parse(match[1]) as PipelineStateData;
    } catch {
      return null;
    }
  }

  async writeState(
    issueNumber: number,
    state: PipelineStateData
  ): Promise<void> {
    const json = JSON.stringify(state, null, 2);
    const body = `${STATE_MARKER}\n<details><summary>Pipeline: ${state.state}</summary>\n\n\`\`\`json\n${json}\n\`\`\`\n</details>`;

    const comments = await this.github
      .getIssueComments(issueNumber)
      .catch(() => []);

    const existing = [...comments]
      .reverse()
      .find((c) => c.body?.includes(STATE_MARKER));

    if (existing) {
      await this.github.updateComment(existing.id, body);
    } else {
      await this.github.commentOnIssue(issueNumber, body);
    }
  }

  // ─── State Queries ────────────────────────────────────────────────────

  async getState(issueNumber: number): Promise<PipelineState | 'unknown'> {
    const data = await this.readState(issueNumber);
    return data?.state ?? 'unknown';
  }

  // ─── Transitions ──────────────────────────────────────────────────────

  isValidTransition(from: string, to: PipelineState): boolean {
    // "any" state can transition to "stuck"
    const anyTargets = STATE_TRANSITIONS['_any'] ?? [];
    if ((anyTargets as readonly string[]).includes(to)) return true;

    const allowed = STATE_TRANSITIONS[from];
    if (!allowed) return false;
    return (allowed as readonly string[]).includes(to);
  }

  async transition(
    issueNumber: number,
    newState: PipelineState,
    overrides: Partial<
      Pick<PipelineStateData, 'attempt' | 'errorContext' | 'prNumber' | 'branches' | 'lockId'>
    > = {}
  ): Promise<PipelineStateData> {
    if (!PIPELINE_STATES.includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const now = new Date().toISOString();
    const current = await this.readState(issueNumber);
    const currentState = current?.state ?? 'unknown';

    // Validate transition
    if (currentState === 'unknown') {
      if (newState !== 'planned' && newState !== 'implementing') {
        if (!this.isValidTransition(currentState, newState)) {
          throw new Error(
            `Invalid transition from '${currentState}' to '${newState}'`
          );
        }
      }
    } else if (!this.isValidTransition(currentState, newState)) {
      throw new Error(
        `Invalid transition from '${currentState}' to '${newState}'`
      );
    }

    const newData: PipelineStateData = current
      ? {
          ...current,
          state: newState,
          lastTransition: now,
          history: [
            ...current.history,
            { state: newState, at: now },
          ],
          ...overrides,
        }
      : {
          state: newState,
          attempt: 0,
          maxAttempts: 6,
          branches: { pr: null, tmp: null, internal: null },
          prNumber: null,
          lastTransition: now,
          history: [{ state: newState, at: now }],
          lockId: null,
          errorContext: null,
          ...overrides,
        };

    await this.writeState(issueNumber, newData);
    return newData;
  }

  // ─── Locking ──────────────────────────────────────────────────────────

  async acquireLock(
    issueNumber: number,
    lockId: string
  ): Promise<boolean> {
    const current = await this.readState(issueNumber);
    if (!current) {
      throw new Error(
        `No state exists for issue #${issueNumber}. Initialize state first.`
      );
    }

    // Idempotent: already held by same id
    if (current.lockId === lockId) return true;

    // Held by someone else
    if (current.lockId !== null) return false;

    // Acquire
    current.lockId = lockId;
    await this.writeState(issueNumber, current);
    return true;
  }

  async checkLock(
    issueNumber: number,
    expectedLockId: string
  ): Promise<boolean> {
    const current = await this.readState(issueNumber);
    return current?.lockId === expectedLockId;
  }

  async releaseLock(
    issueNumber: number,
    lockId: string
  ): Promise<void> {
    const isOwner = await this.checkLock(issueNumber, lockId);
    if (!isOwner) {
      throw new Error(`Lock not held by '${lockId}', cannot release`);
    }

    const current = await this.readState(issueNumber);
    if (current) {
      current.lockId = null;
      await this.writeState(issueNumber, current);
    }
  }
}
