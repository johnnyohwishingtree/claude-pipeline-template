/**
 * Tests for pipeline environment configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, envSummary } from '../../lib/env.js';

describe('loadEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set required vars
    process.env['GH_PAT'] = 'ghp_test123';
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    // Clear optional vars
    delete process.env['PREFERRED_AGENT'];
    delete process.env['PORT'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads required env vars', () => {
    const env = loadEnv();
    expect(env.ghToken).toBe('ghp_test123');
    expect(env.repo).toBe('owner/repo');
  });

  it('applies defaults for optional vars', () => {
    const env = loadEnv();
    expect(env.preferredAgent).toBe('claude');
    expect(env.port).toBe(3000);
    expect(env.nodeEnv).toBe('development');
  });

  it('throws when GH_PAT is missing', () => {
    delete process.env['GH_PAT'];
    expect(() => loadEnv()).toThrow('GH_PAT');
  });

  it('throws when GITHUB_REPOSITORY is missing', () => {
    delete process.env['GITHUB_REPOSITORY'];
    expect(() => loadEnv()).toThrow('GITHUB_REPOSITORY');
  });

  it('throws for invalid PREFERRED_AGENT', () => {
    process.env['PREFERRED_AGENT'] = 'invalid';
    expect(() => loadEnv()).toThrow("must be 'claude' or 'gemini'");
  });

  it('throws for invalid NODE_ENV', () => {
    process.env['NODE_ENV'] = 'staging';
    expect(() => loadEnv()).toThrow("must be 'production', 'development', or 'test'");
  });

  it('reads optional vars when set', () => {
    process.env['PORT'] = '8080';
    process.env['NODE_ENV'] = 'production';
    process.env['PREFERRED_AGENT'] = 'gemini';

    const env = loadEnv();
    expect(env.port).toBe(8080);
    expect(env.nodeEnv).toBe('production');
    expect(env.preferredAgent).toBe('gemini');
  });
});

describe('envSummary', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['GH_PAT'] = 'ghp_test123';
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('redacts sensitive values', () => {
    const env = loadEnv();
    const summary = envSummary(env);

    expect(summary['ghToken']).toBe('***set***');
    expect(summary['repo']).toBe('owner/repo');
  });
});
