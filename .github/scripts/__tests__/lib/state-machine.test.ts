import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STATES,
  STATE_TRANSITIONS,
  type PipelineState,
  type PipelineStateData,
} from '../../lib/types.js';

// Test the state machine validation logic directly (without GitHub API calls)

function isValidTransition(from: string, to: PipelineState): boolean {
  const anyTargets = STATE_TRANSITIONS['_any'] ?? [];
  if ((anyTargets as readonly string[]).includes(to)) return true;
  const allowed = STATE_TRANSITIONS[from];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

function createFreshState(
  state: PipelineState,
  overrides: Partial<PipelineStateData> = {}
): PipelineStateData {
  return {
    state,
    attempt: 0,
    maxAttempts: 6,
    branches: { pr: null, tmp: null, internal: null },
    prNumber: null,
    lastTransition: new Date().toISOString(),
    history: [{ state, at: new Date().toISOString() }],
    lockId: null,
    errorContext: null,
    ...overrides,
  };
}

describe('Pipeline States', () => {
  it('has 12 valid states', () => {
    expect(PIPELINE_STATES).toHaveLength(12);
  });

  it('includes all expected states', () => {
    const expected = [
      'planned',
      'implementing',
      'verifying',
      'fix-loop',
      'verified',
      'reviewing',
      'fix-reviews',
      'approved',
      'merging',
      'merged',
      'escalated',
      'stuck',
    ];
    expect(PIPELINE_STATES).toEqual(expected);
  });
});

describe('State Transitions', () => {
  it('allows planned → implementing', () => {
    expect(isValidTransition('planned', 'implementing')).toBe(true);
  });

  it('allows implementing → verifying', () => {
    expect(isValidTransition('implementing', 'verifying')).toBe(true);
  });

  it('allows implementing → escalated', () => {
    expect(isValidTransition('implementing', 'escalated')).toBe(true);
  });

  it('allows verifying → fix-loop', () => {
    expect(isValidTransition('verifying', 'fix-loop')).toBe(true);
  });

  it('allows verifying → verified', () => {
    expect(isValidTransition('verifying', 'verified')).toBe(true);
  });

  it('allows fix-loop → verifying (retry)', () => {
    expect(isValidTransition('fix-loop', 'verifying')).toBe(true);
  });

  it('allows fix-loop → escalated', () => {
    expect(isValidTransition('fix-loop', 'escalated')).toBe(true);
  });

  it('allows verified → reviewing', () => {
    expect(isValidTransition('verified', 'reviewing')).toBe(true);
  });

  it('allows reviewing → approved', () => {
    expect(isValidTransition('reviewing', 'approved')).toBe(true);
  });

  it('allows reviewing → fix-reviews', () => {
    expect(isValidTransition('reviewing', 'fix-reviews')).toBe(true);
  });

  it('allows fix-reviews → reviewing', () => {
    expect(isValidTransition('fix-reviews', 'reviewing')).toBe(true);
  });

  it('allows approved → merging', () => {
    expect(isValidTransition('approved', 'merging')).toBe(true);
  });

  it('allows merging → merged', () => {
    expect(isValidTransition('merging', 'merged')).toBe(true);
  });

  it('allows merged → planned (next story)', () => {
    expect(isValidTransition('merged', 'planned')).toBe(true);
  });

  it('allows escalated → implementing (recovery)', () => {
    expect(isValidTransition('escalated', 'implementing')).toBe(true);
  });

  it('allows stuck → implementing (recovery)', () => {
    expect(isValidTransition('stuck', 'implementing')).toBe(true);
  });

  it('allows any state → stuck', () => {
    for (const state of PIPELINE_STATES) {
      expect(isValidTransition(state, 'stuck')).toBe(true);
    }
  });

  it('rejects invalid transitions', () => {
    expect(isValidTransition('planned', 'merged')).toBe(false);
    expect(isValidTransition('verifying', 'approved')).toBe(false);
    expect(isValidTransition('reviewing', 'merged')).toBe(false);
    expect(isValidTransition('merged', 'reviewing')).toBe(false);
  });

  it('rejects planned → verified (must go through implementing)', () => {
    expect(isValidTransition('planned', 'verified')).toBe(false);
  });
});

describe('PipelineStateData', () => {
  it('creates fresh state with defaults', () => {
    const state = createFreshState('planned');
    expect(state.state).toBe('planned');
    expect(state.attempt).toBe(0);
    expect(state.maxAttempts).toBe(6);
    expect(state.branches.pr).toBeNull();
    expect(state.prNumber).toBeNull();
    expect(state.lockId).toBeNull();
    expect(state.errorContext).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].state).toBe('planned');
  });

  it('applies overrides', () => {
    const state = createFreshState('implementing', {
      attempt: 2,
      prNumber: 42,
      lockId: 'test-lock',
    });
    expect(state.attempt).toBe(2);
    expect(state.prNumber).toBe(42);
    expect(state.lockId).toBe('test-lock');
  });

  it('tracks state history', () => {
    const state = createFreshState('planned');
    state.history.push({ state: 'implementing', at: new Date().toISOString() });
    state.history.push({ state: 'verifying', at: new Date().toISOString() });
    expect(state.history).toHaveLength(3);
    expect(state.history.map((h) => h.state)).toEqual([
      'planned',
      'implementing',
      'verifying',
    ]);
  });
});
