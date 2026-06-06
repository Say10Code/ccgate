import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, setDbPath } from './db.js';
import {
  ensureSession,
  recordRequest,
  getSession,
  listSessions,
  getDailySpent,
  getMonthlySpent,
  getStats,
} from './session.js';
import { UsageMetrics } from './sse-interceptor.js';
import { config } from './config.js';

describe('Session management', () => {
  beforeAll(() => {
    // Use a separate test DB so we don't pollute production data
    setDbPath(`${config.dataDir}/ccgate-test.db`);
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  const testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const testMetrics: UsageMetrics = {
    model: 'deepseek-v4-flash',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    events: [],
  };

  it('creates a new session', () => {
    const session = ensureSession(testSessionId, 'Test Session');
    expect(session.id).toBe(testSessionId);
    expect(session.name).toBe('Test Session');
    expect(session.status).toBe('active');
    expect(session.request_count).toBe(0);
  });

  it('returns existing session on second call', () => {
    const session = ensureSession(testSessionId);
    expect(session.id).toBe(testSessionId);
    expect(session.name).toBe('Test Session'); // original name preserved
  });

  it('records a request and updates session aggregates', () => {
    const breakdown = recordRequest(testSessionId, testMetrics, 1500, 'claude-sonnet-4-6', 200, true);

    // Check cost breakdown
    expect(breakdown.model).toBe('deepseek-v4-flash');
    expect(breakdown.inputTokens).toBe(1000);
    expect(breakdown.outputTokens).toBe(500);
    expect(breakdown.cost).toBeGreaterThan(0);

    // Check session updated
    const session = getSession(testSessionId);
    expect(session).toBeDefined();
    expect(session!.request_count).toBeGreaterThanOrEqual(1);
    expect(session!.total_input_tokens).toBeGreaterThanOrEqual(1000);
    expect(session!.total_output_tokens).toBeGreaterThanOrEqual(500);
    expect(session!.total_cost).toBeGreaterThan(0);
  });

  it('records multiple requests correctly', () => {
    recordRequest(testSessionId, {
      model: 'deepseek-v4-pro',
      inputTokens: 2000,
      outputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 300,
      events: [],
    }, 2300, 'claude-opus-4-8', 200, true);

    const session = getSession(testSessionId);
    expect(session!.request_count).toBeGreaterThanOrEqual(2);
    expect(session!.total_input_tokens).toBeGreaterThanOrEqual(3000);
    expect(session!.total_output_tokens).toBeGreaterThanOrEqual(1300);
  });

  it('lists sessions', () => {
    const sessions = listSessions(10);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].id).toBeDefined();
  });

  it('returns stats', () => {
    const stats = getStats();
    expect(stats.total_sessions).toBeGreaterThanOrEqual(1);
    expect(stats.total_requests).toBeGreaterThanOrEqual(2);
    expect(stats.total_tokens).toBeGreaterThan(0);
    expect(stats.total_cost).toBeGreaterThan(0);
  });

  it('getDailySpent returns a number', () => {
    const spent = getDailySpent();
    expect(typeof spent).toBe('number');
  });

  it('getMonthlySpent returns a number', () => {
    const spent = getMonthlySpent();
    expect(typeof spent).toBe('number');
  });

  it('returns null for non-existent session', () => {
    const session = getSession('non-existent-id-99999');
    expect(session).toBeNull();
  });
});
