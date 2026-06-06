/**
 * ccgate Live Monitor.
 *
 * Single unified mode. No VT tricks, no cursor manipulation, no blessed.
 * Works on every terminal: PowerShell 5.1, cmd.exe, Windows Terminal, SSH, tmux.
 *
 * Events (request start/end, budget alerts) print immediately.
 * Stats summary prints every 2 seconds.
 */

import chalk from 'chalk';
import { eventBus } from './event-bus.js';
import { getStats, listSessions } from './session.js';
import { getBudgetSummary } from './budget.js';
import { config } from './config.js';
import type { RequestStartEvent, RequestEndEvent, BudgetAlertEvent } from './event-bus.js';
import readline from 'readline';

// ── State ─────────────────────────────────────────────────────

let startTime = 0;
let timer: ReturnType<typeof setInterval>;
let running = false;
let pendingRequests = 0;  // counter for requests that started but haven't ended yet

// ── Output ─────────────────────────────────────────────────────

function out(s: string): void { process.stdout.write(s); }

// ── Helpers ────────────────────────────────────────────────────

function ft(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function bar(pct: number): string {
  const w = 8;
  const f = Math.max(0, Math.min(w, Math.round((pct / 100) * w)));
  const block = '█'.repeat(f) + '░'.repeat(w - f);
  if (pct >= 100) return chalk.red(block);
  if (pct >= 95) return chalk.red(block);
  if (pct >= 80) return chalk.yellow(block);
  return chalk.green(block);
}

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function up(): string {
  const s = Math.floor((Date.now() - startTime) / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── Print stats summary line ───────────────────────────────────

function printSummary(): void {
  const stats = getStats();
  const budget = getBudgetSummary();
  const s = stats;

  out(
    chalk.gray(ts()) + '  ' +
    chalk.green('$' + s.today_cost.toFixed(4)) + '  ' +
    chalk.white(String(s.total_requests).padStart(4) + ' reqs') + '  ' +
    chalk.yellow(ft(s.total_tokens).padStart(7) + ' tok') + '  ' +
    chalk.cyan(String(s.active_sessions).padStart(2) + ' sess') + '  ' +
    'budget ' + (budget.daily.status === 'ok' ? chalk.green : chalk.yellow)(budget.daily.pct.toFixed(1) + '%') +
    '  ' +
    (pendingRequests > 0 ? chalk.cyan(`[${pendingRequests} in-flight]`) : chalk.gray('idle')) +
    '\n'
  );
}

// ── Print session table (on demand) ────────────────────────────

function printSessions(): void {
  const sessions = listSessions(10);
  if (sessions.length === 0) return;

  out(chalk.gray('\n┌─ Active Sessions' + '─'.repeat(40) + '\n'));
  out(chalk.gray('│ ') + chalk.bold('SESSION    REQS    TOKENS      COST\n'));
  out(chalk.gray('│ ') + chalk.gray('─'.repeat(46)) + '\n');

  for (const s of sessions.slice(0, 10)) {
    const icon = s.status === 'active' ? chalk.green('●') : chalk.yellow('■');
    out(
      chalk.gray('│ ') +
      icon + ' ' +
      chalk.cyan(s.id.slice(0, 8)) + '  ' +
      String(s.request_count).padStart(4) + '  ' +
      ft(s.total_input_tokens + s.total_output_tokens).padStart(8) + '  ' +
      chalk.green('$' + s.total_cost.toFixed(4)) + '\n'
    );
  }
  out(chalk.gray('└' + '─'.repeat(50) + '\n\n'));
}

// ── Event handlers (print immediately) ─────────────────────────

function setupEvents(): void {
  eventBus.onRequestStart((e: RequestStartEvent) => {
    pendingRequests++;
    out(
      chalk.gray(ts()) + ' ' +
      chalk.cyan('→') + ' ' + chalk.cyan(e.sessionId.slice(0, 6)) + '  ' +
      chalk.white(e.originalModel) + ' ' + chalk.gray('→') + ' ' + chalk.white(e.remappedModel) + '\n'
    );
  });

  eventBus.onRequestEnd((e: RequestEndEvent) => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    out(
      chalk.gray(ts()) + ' ' +
      chalk.green('✓') + ' ' + chalk.cyan(e.sessionId.slice(0, 6)) + '  ' +
      chalk.green('$' + e.cost.toFixed(6)) + '  ' +
      `${e.metrics.inputTokens}→${e.metrics.outputTokens} tok` + '  ' +
      chalk.gray(e.durationMs + 'ms') + '\n'
    );
  });

  eventBus.onBudgetAlert((e: BudgetAlertEvent) => {
    out(
      chalk.gray(ts()) + ' ' +
      chalk.yellow('⚠ BUDGET') + ' ' + e.period + ' ' +
      '$' + e.spent.toFixed(2) + '/' + e.limit.toFixed(2) +
      ' (' + e.pct.toFixed(1) + '%)\n'
    );
  });
}

// ── Keyboard ──────────────────────────────────────────────────

function setupKeyboard(): void {
  if (!process.stdin.isTTY) return;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_str, key) => {
    if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      stop();
      process.exit(0);
    }
    if (key.name === 's') {
      // Print session table on demand
      printSessions();
    }
  });
}

// ── Public API ─────────────────────────────────────────────────

export function startWatch(): void {
  if (running) return;
  running = true;
  startTime = Date.now();

  // ── Banner ──────────────────────────────────────────────────
  out('\n' + chalk.bgBlue.whiteBright.bold(' ccgate v0.2.0 ') + '\n');
  out(chalk.gray('Proxy  ') + chalk.white(`http://127.0.0.1:${config.port}`) + '\n');
  out(chalk.gray('Config ') + chalk.cyan('ANTHROPIC_BASE_URL=http://127.0.0.1:4100') + chalk.gray('  (no /v1!)') + '\n');
  out(chalk.gray('Target ') + chalk.white(config.upstreamUrl) + '\n');
  out(chalk.gray('Budget ') + chalk.white(`$${config.dailyBudget}/day  $${config.monthlyBudget}/month`) + '\n');
  out(chalk.gray('─'.repeat(60)) + '\n');
  out(chalk.gray('Events appear below. ') + chalk.white('Ctrl+C') + chalk.gray(' to quit, ') + chalk.white('s') + chalk.gray(' for sessions\n'));
  out(chalk.gray('─'.repeat(60)) + '\n\n');

  setupEvents();
  setupKeyboard();

  printSummary();
  timer = setInterval(printSummary, 2000);
}

// Legacy alias
export { startWatch as startTui };

export function stop(): void {
  if (!running) return;
  running = false;
  clearInterval(timer);
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch { /* ignore */ }
    process.stdin.removeAllListeners('keypress');
  }
  out('\n' + chalk.gray('ccgate stopped.') + '\n');
}

export { stop as stopTui };
