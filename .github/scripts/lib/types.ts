/**
 * Core types for the pipeline orchestration.
 * Ports the state-machine.sh states and lib.sh concepts to TypeScript.
 */

// ─── Pipeline States ────────────────────────────────────────────────────────

export const PIPELINE_STATES = [
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
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];

/** Valid state transitions. Key = from state, value = allowed target states. */
export const STATE_TRANSITIONS: Record<string, readonly PipelineState[]> = {
  planned: ['implementing'],
  implementing: ['verifying', 'escalated'],
  verifying: ['fix-loop', 'verified'],
  'fix-loop': ['verifying', 'escalated'],
  verified: ['reviewing'],
  reviewing: ['approved', 'fix-reviews'],
  'fix-reviews': ['reviewing', 'escalated'],
  approved: ['merging'],
  merging: ['merged', 'approved'],
  merged: ['planned'],
  escalated: ['implementing'],
  stuck: ['implementing'],
  // "any" state can transition to "stuck"
  _any: ['stuck'],
} as const;

// ─── State Machine Data ─────────────────────────────────────────────────────

export interface PipelineStateData {
  state: PipelineState;
  attempt: number;
  maxAttempts: number;
  /** Per-activity attempt counters (e.g., { verify: 2, fix: 1 }) */
  attempts?: Partial<Record<ActivityType, number>>;
  branches: {
    pr: string | null;
    tmp: string | null;
    internal: string | null;
  };
  prNumber: number | null;
  lastTransition: string; // ISO timestamp
  history: Array<{ state: PipelineState; at: string }>;
  lockId: string | null;
  errorContext: string | null;
}

// ─── Activity Attempt Limits ────────────────────────────────────────────────

export const ACTIVITY_LIMITS = {
  implement: 3,
  verify: 6,
  fix: 6,
  review: 3,
  fixReview: 3,
  merge: 3,
  orchestrate: 1,
} as const;

export type ActivityType = keyof typeof ACTIVITY_LIMITS;

// ─── CI Status ──────────────────────────────────────────────────────────────

export interface CIStatus {
  testsPass: boolean;
  e2ePass: boolean;
}

// ─── Merge Gate Conditions ──────────────────────────────────────────────────

export interface MergeGateResult {
  action: 'merge' | 'update_branch' | 'wait' | 'skip';
  conditions: {
    testsPass: boolean;
    e2ePass: boolean;
    approved: boolean;
    threadsResolved: boolean;
    noActiveReviewFix: boolean;
    branchUpToDate: boolean;
  };
  failingConditions: string[];
}

// ─── Story & Epic ───────────────────────────────────────────────────────────

export interface StoryContext {
  issueNumber: number;
  title: string;
  epicLabel: string;
  repo: string;
}

export interface PRContext {
  number: number;
  headBranch: string;
  headSha: string;
  repo: string;
  linkedIssue: number | null;
}

// ─── Review Feedback ────────────────────────────────────────────────────────

export interface ReviewFeedback {
  prNumber: number;
  reviewer: string;
  body: string;
  inlineComments: Array<{
    path: string;
    line: number;
    body: string;
  }>;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
}

// ─── Verify Check Modes ─────────────────────────────────────────────────────

export type CheckMode = 'all' | 'ci' | 'e2e';

export interface VerifyResult {
  pass: boolean;
  errorSummary: string;
  checkBranch: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface PipelineConfig {
  repo: string;
  preferredAgent: 'claude' | 'gemini';
  maxConcurrentAgents: number;
  watcherIntervalMinutes: number;
  consecutiveFailurePauseThreshold: number;
}
