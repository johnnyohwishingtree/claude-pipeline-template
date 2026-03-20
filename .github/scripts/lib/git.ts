/**
 * Git operations — local git commands via child_process.
 *
 * These functions replace the git-related functions from lib.sh:
 *   setup_git_auth, merge_master_into_branch, check_changes_and_commit, smart_push
 */

import { execSync } from 'node:child_process';

function run(cmd: string, opts?: { allowFailure?: boolean }): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (opts?.allowFailure) return '';
    throw err;
  }
}

/**
 * Configure git remote URL with token and set user.name/email.
 * Port of: setup_git_auth() in lib.sh
 */
export function setupGitAuth(opts?: {
  token?: string;
  repo?: string;
  userName?: string;
  userEmail?: string;
}): void {
  const token = opts?.token ?? process.env['GH_TOKEN'] ?? process.env['GH_PAT'];
  const repo = opts?.repo ?? process.env['GITHUB_REPOSITORY'];
  const userName = opts?.userName ?? process.env['GIT_USER_NAME'] ?? 'Claude CI';
  const userEmail = opts?.userEmail ?? process.env['GIT_USER_EMAIL'] ?? 'claude-ci@users.noreply.github.com';

  if (!token) throw new Error('GH_TOKEN or GH_PAT is required');
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');

  run(`git remote set-url origin "https://x-access-token:${token}@github.com/${repo}.git"`);
  run(`git config user.name "${userName}"`);
  run(`git config user.email "${userEmail}"`);
}

/**
 * Fetch and merge master into the current branch.
 * Port of: merge_master_into_branch() in lib.sh
 *
 * Returns true if merge succeeded, false if conflict (merge aborted).
 */
export function mergeMasterIntoBranch(): boolean {
  run('git fetch origin master');

  try {
    run('git merge origin/master --no-edit');
    return true;
  } catch {
    console.error('::warning::Merge conflict with master');
    run('git merge --abort', { allowFailure: true });

    // Export MERGE_CONFLICT for downstream steps
    const githubEnv = process.env['GITHUB_ENV'];
    if (githubEnv) {
      const fs = require('node:fs') as typeof import('node:fs');
      fs.appendFileSync(githubEnv, 'MERGE_CONFLICT=true\n');
    }
    return false;
  }
}

/**
 * Check for uncommitted changes and commit with standard format.
 * Port of: check_changes_and_commit() in lib.sh
 *
 * Returns true if a commit was created, false if nothing to commit.
 */
export function checkChangesAndCommit(
  message: string,
  coAuthor: string = 'Claude <noreply@anthropic.com>'
): boolean {
  const changes = run('git status --porcelain', { allowFailure: true });
  const filtered = changes.split('\n').filter((l) => l && l !== '?? output.txt').join('\n');

  if (!filtered) {
    console.log('No uncommitted changes');
    return false;
  }

  run('git add -u');

  const staged = run('git diff --cached --name-only', { allowFailure: true });
  if (!staged) {
    console.log('No staged changes after filtering');
    return false;
  }

  const fullMessage = `${message}\n\nCo-authored-by: ${coAuthor}`;
  execSync('git commit -F -', { input: fullMessage, stdio: ['pipe', 'inherit', 'inherit'] });
  return true;
}

/**
 * Push to remote with local/remote HEAD comparison.
 * Port of: smart_push() in lib.sh
 */
export function smartPush(branch: string, prePushHead?: string): boolean {
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
  run(`git fetch origin "${branch}"`, { allowFailure: true });

  const localHead = run('git rev-parse HEAD');
  const remoteHead = run(`git rev-parse "origin/${branch}"`, { allowFailure: true }) || 'none';

  if (prePushHead) {
    if (localHead === prePushHead && remoteHead === prePushHead) {
      console.log('No changes produced (local and remote unchanged)');
      return true;
    }
  }

  if (localHead === remoteHead) {
    console.log('Local HEAD matches remote — nothing to push');
    return true;
  }

  run(`git pull --rebase origin "${branch}"`, { allowFailure: true });
  run(`git push origin "HEAD:refs/heads/${branch}"`);
  console.log(`Pushed to ${branch}`);
  return true;
}
