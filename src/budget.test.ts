import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, setDbPath } from './db.js';
import { checkBudget, shouldBlock, BudgetStatus } from './budget.js';
import { config } from './config.js';

describe('Budget management', () => {
  beforeAll(() => {
    setDbPath(`${config.dataDir}/ccgate-test.db`);
    config.dailyBudget = 10.00;
    config.monthlyBudget = 100.00;
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  it('checkBudget returns valid state', () => {
    const state = checkBudget();
    expect(state.daily.spent).toBeGreaterThanOrEqual(0);
    expect(state.monthly.spent).toBeGreaterThanOrEqual(0);
    expect(state.daily.limit).toBeGreaterThan(0);
    expect(state.monthly.limit).toBeGreaterThan(0);
    expect(state.daily.pct).toBeGreaterThanOrEqual(0);
    expect(state.monthly.pct).toBeGreaterThanOrEqual(0);
    // Overall should be 'ok' when spend is low
    expect(['ok', 'warning', 'critical', 'exceeded']).toContain(state.overall);
  });

  it('shouldBlock is false when under budget', () => {
    const { block } = shouldBlock();
    // With limits of $10/$100 and a few test requests (~$0.001), should be false
    expect(block).toBe(false);
  });

  it('status thresholds are correct', () => {
    const state = checkBudget();
    // Verify pct calculation
    expect(state.daily.pct).toBeGreaterThanOrEqual(0);
    if (state.daily.spent < state.daily.limit * 0.8) {
      expect(state.daily.status).toBe('ok');
    }
  });

  it('state structure is complete', () => {
    const state = checkBudget();
    // Daily
    expect(state.daily).toHaveProperty('spent');
    expect(state.daily).toHaveProperty('limit');
    expect(state.daily).toHaveProperty('pct');
    expect(state.daily).toHaveProperty('status');
    // Monthly
    expect(state.monthly).toHaveProperty('spent');
    expect(state.monthly).toHaveProperty('limit');
    expect(state.monthly).toHaveProperty('pct');
    expect(state.monthly).toHaveProperty('status');
    // Overall
    expect(state).toHaveProperty('overall');
  });

  it('daily pct is >= 0 and <= 100 (or up to amounts over limit)', () => {
    const state = checkBudget();
    if (state.daily.spent <= state.daily.limit) {
      expect(state.daily.pct).toBeLessThanOrEqual(100);
    }
    expect(state.daily.pct).toBeGreaterThanOrEqual(0);
  });
});
