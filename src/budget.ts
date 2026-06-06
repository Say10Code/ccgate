import { getDb } from './db.js';
import { getDailySpent, getMonthlySpent } from './session.js';
import { config } from './config.js';
import { logger } from './logger.js';

export type BudgetStatus = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface BudgetState {
  daily: {
    spent: number;
    limit: number;
    pct: number;
    status: BudgetStatus;
  };
  monthly: {
    spent: number;
    limit: number;
    pct: number;
    status: BudgetStatus;
  };
  overall: BudgetStatus;
}

// ── Threshold definitions ───────────────────────────────────
const WARNING_PCT = 80;
const CRITICAL_PCT = 95;
const EXCEEDED_PCT = 100;

// Track when we last logged warnings (throttle to avoid spam)
let lastWarningLog = 0;
const WARNING_THROTTLE_MS = 30_000; // 30 seconds between budget alerts

/**
 * Check current budget state against configured limits.
 */
export function checkBudget(): BudgetState {
  const dailySpent = getDailySpent();
  const monthlySpent = getMonthlySpent();

  const dailyLimit = config.dailyBudget;
  const monthlyLimit = config.monthlyBudget;

  const dailyPct = dailyLimit > 0 ? (dailySpent / dailyLimit) * 100 : 0;
  const monthlyPct = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;

  const dailyStatus = getStatus(dailyPct);
  const monthlyStatus = getStatus(monthlyPct);

  // Overall status = worst of the two
  const overall = statusOrder(dailyStatus) > statusOrder(monthlyStatus) ? dailyStatus : monthlyStatus;

  const state: BudgetState = {
    daily: { spent: dailySpent, limit: dailyLimit, pct: dailyPct, status: dailyStatus },
    monthly: { spent: monthlySpent, limit: monthlyLimit, pct: monthlyPct, status: monthlyStatus },
    overall,
  };

  return state;
}

/**
 * Check budget before forwarding a request.
 * Returns true if the request should be BLOCKED.
 */
export function shouldBlock(): { block: boolean; reason?: string; state: BudgetState } {
  const state = checkBudget();

  if (state.overall === 'exceeded') {
    return {
      block: true,
      reason: `Budget exceeded: $${state.daily.spent.toFixed(2)} / $${state.daily.limit.toFixed(2)} (daily), $${state.monthly.spent.toFixed(2)} / $${state.monthly.limit.toFixed(2)} (monthly)`,
      state,
    };
  }

  return { block: false, state };
}

/**
 * Log budget warnings (throttled to avoid spam).
 */
export function logBudgetStatus(state: BudgetState, force = false): void {
  const now = Date.now();
  if (!force && state.overall === 'ok') return;
  if (!force && now - lastWarningLog < WARNING_THROTTLE_MS) return;

  lastWarningLog = now;

  if (state.daily.status !== 'ok') {
    logger.logBudget(state.daily.spent, state.daily.limit, 'daily');
  }
  if (state.monthly.status !== 'ok') {
    logger.logBudget(state.monthly.spent, state.monthly.limit, 'monthly');
  }
}

/**
 * Get budget state for API/dashboard responses.
 */
export function getBudgetSummary() {
  const state = checkBudget();

  // Sync limits to DB
  const db = getDb();
  db.prepare(`
    UPDATE budget SET
      daily_limit = ?,
      monthly_limit = ?,
      daily_spent = ?,
      monthly_spent = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(state.daily.limit, state.monthly.limit, state.daily.spent, state.monthly.spent);

  return state;
}

// ── Private ──────────────────────────────────────────────────

function getStatus(pct: number): BudgetStatus {
  if (pct >= EXCEEDED_PCT) return 'exceeded';
  if (pct >= CRITICAL_PCT) return 'critical';
  if (pct >= WARNING_PCT) return 'warning';
  return 'ok';
}

function statusOrder(status: BudgetStatus): number {
  switch (status) {
    case 'ok': return 0;
    case 'warning': return 1;
    case 'critical': return 2;
    case 'exceeded': return 3;
  }
}
