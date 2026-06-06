import { getDb } from './db.js';
import { UsageMetrics } from './sse-interceptor.js';
import { calculateCost, CostBreakdown } from './pricing.js';
import { v4 as uuidv4 } from 'uuid';
import type { CountRow, SumRow, ModelRow, CostHistoryRow } from './types.js';

export interface Session {
  id: string;
  name: string;
  created_at: string;
  last_active: string;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost: number;
  status: 'active' | 'paused' | 'completed';
}

export interface RequestRecord {
  id?: number;
  session_id: string;
  model: string;
  original_model?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
  duration_ms: number;
  is_streaming: boolean;
  status_code?: number;
  created_at?: string;
}

/**
 * Get or create a session.
 */
export function ensureSession(sessionId: string, name?: string): Session {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session | undefined;
  if (existing) return existing;

  db.prepare(`
    INSERT INTO sessions (id, name)
    VALUES (?, ?)
  `).run(sessionId, name || sessionId.slice(0, 8));

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session;
}

/**
 * Record a completed request: write to DB and update session aggregates.
 * Returns the full cost breakdown.
 */
export function recordRequest(
  sessionId: string,
  metrics: UsageMetrics,
  durationMs: number,
  originalModel?: string,
  statusCode?: number,
  isStreaming = true,
): CostBreakdown {
  const db = getDb();
  const costBreakdown = calculateCost(
    metrics.model,
    metrics.inputTokens,
    metrics.outputTokens,
    metrics.cacheReadTokens,
    metrics.cacheWriteTokens,
  );

  // Ensure session exists
  ensureSession(sessionId);

  // Insert request record
  db.prepare(`
    INSERT INTO requests (session_id, model, original_model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost, duration_ms, is_streaming, status_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    metrics.model,
    originalModel || metrics.model,
    metrics.inputTokens,
    metrics.outputTokens,
    metrics.cacheReadTokens,
    metrics.cacheWriteTokens,
    costBreakdown.cost,
    durationMs,
    isStreaming ? 1 : 0,
    statusCode || 200,
  );

  // Update session aggregates
  db.prepare(`
    UPDATE sessions
    SET
      last_active = datetime('now'),
      request_count = request_count + 1,
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      total_cache_read_tokens = total_cache_read_tokens + ?,
      total_cache_write_tokens = total_cache_write_tokens + ?,
      total_cost = total_cost + ?
    WHERE id = ?
  `).run(
    metrics.inputTokens,
    metrics.outputTokens,
    metrics.cacheReadTokens,
    metrics.cacheWriteTokens,
    costBreakdown.cost,
    sessionId,
  );

  return costBreakdown;
}

/**
 * Get session summary.
 */
export function getSession(sessionId: string): Session | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session) || null;
}

/**
 * List all sessions, most recent first.
 */
export function listSessions(limit = 20): Session[] {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions ORDER BY last_active DESC LIMIT ?').all(limit) as Session[];
}

/**
 * Get today's total spend (using local timezone, not UTC).
 * SQLite's date('now') is UTC — we construct the local date string instead.
 */
export function getDailySpent(): number {
  const db = getDb();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const row = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) as total
    FROM requests
    WHERE substr(created_at, 1, 10) = ?
  `).get(localDate) as { total: number };
  return row.total;
}

/**
 * Get this month's total spend (local timezone).
 */
export function getMonthlySpent(): number {
  const db = getDb();
  const today = new Date();
  const localMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const row = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) as total
    FROM requests
    WHERE substr(created_at, 1, 7) = ?
  `).get(localMonth) as { total: number };
  return row.total;
}

/**
 * Pause a session (e.g., budget exceeded).
 */
export function pauseSession(sessionId: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId);
}

/**
 * Get recent requests for a session.
 */
export function getSessionRequests(sessionId: string, limit = 50): RequestRecord[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM requests WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(sessionId, limit) as RequestRecord[];
}

/**
 * Get all requests with pagination.
 */
export function getAllRequests(limit = 50, offset = 0): { requests: RequestRecord[]; total: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM requests').get() as CountRow).c;
  const requests = db.prepare(
    'SELECT * FROM requests ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as RequestRecord[];
  return { requests, total };
}

/**
 * Get cost per model breakdown.
 */
export function getModelBreakdown(): Array<{ model: string; requests: number; tokens: number; cost: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT model, COUNT(*) as requests,
           COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
           COALESCE(SUM(cost), 0) as cost
    FROM requests
    GROUP BY model
    ORDER BY cost DESC
  `).all() as any[];
}

/**
 * Get hourly cost history for charts.
 */
export function getCostHistory(hours = 24): Array<{ hour: string; cost: number; requests: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:00:00Z', created_at) as hour,
           COALESCE(SUM(cost), 0) as cost,
           COUNT(*) as requests
    FROM requests
    WHERE created_at >= datetime('now', '-${hours} hours')
    GROUP BY strftime('%Y-%m-%dT%H:00:00Z', created_at)
    ORDER BY hour ASC
  `).all() as any[];
}

/**
 * Get global stats.
 */
export function getStats(): {
  total_sessions: number;
  active_sessions: number;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  today_cost: number;
  month_cost: number;
} {
  const db = getDb();

  const totalSessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as CountRow).c;
  const activeSessions = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'").get() as CountRow).c;
  const totalRequests = (db.prepare('SELECT COUNT(*) as c FROM requests').get() as CountRow).c;
  const totalTokens = (db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as t FROM requests').get() as SumRow).t;
  const totalCost = (db.prepare('SELECT COALESCE(SUM(cost), 0) as t FROM requests').get() as SumRow).t;

  return {
    total_sessions: totalSessions,
    active_sessions: activeSessions,
    total_requests: totalRequests,
    total_tokens: totalTokens,
    total_cost: totalCost,
    today_cost: getDailySpent(),
    month_cost: getMonthlySpent(),
  };
}
