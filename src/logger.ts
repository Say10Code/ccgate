import chalk from 'chalk';
import { config } from './config.js';
import { UsageMetrics } from './sse-interceptor.js';
import { appendFileSync } from 'fs';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  ts: string;
  session?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cache_read?: number;
  cache_write?: number;
  cost?: number;
  duration_ms?: number;
  budget_spent?: number;
  budget_limit?: number;
  budget_pct?: number;
  [key: string]: unknown;
}

/**
 * Structured logger — supports both pretty (colorful console) and JSON Lines output
 */
export class Logger {
  private sessionCosts: Map<string, number> = new Map();

  /**
   * Log a completed request with its token usage and cost
   */
  logRequest(metrics: UsageMetrics, sessionId: string, durationMs: number, cost: number): void {
    const totalSession = (this.sessionCosts.get(sessionId) || 0) + cost;
    this.sessionCosts.set(sessionId, totalSession);

    const entry: LogEntry = {
      level: 'info',
      event: 'request',
      ts: new Date().toISOString(),
      session: sessionId.slice(0, 8),
      model: metrics.model,
      tokens_in: metrics.inputTokens,
      tokens_out: metrics.outputTokens,
      cache_read: metrics.cacheReadTokens,
      cache_write: metrics.cacheWriteTokens,
      cost: Math.round(cost * 100000) / 100000, // round to 6 decimal places
      duration_ms: durationMs,
      session_total: Math.round(totalSession * 100000) / 100000,
    };

    if (config.logFormat === 'json') {
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      this.prettyRequest(entry);
    }
  }

  /**
   * Log a budget status event
   */
  logBudget(spent: number, limit: number, period: 'daily' | 'monthly'): void {
    const pct = Math.round((spent / limit) * 1000) / 10;
    const status = pct >= 100 ? 'exceeded' : pct >= 95 ? 'critical' : pct >= 80 ? 'warning' : 'ok';

    const entry: LogEntry = {
      level: status === 'exceeded' ? 'error' : status === 'critical' ? 'warn' : 'info',
      event: 'budget',
      ts: new Date().toISOString(),
      budget_period: period,
      budget_spent: Math.round(spent * 100000) / 100000,
      budget_limit: limit,
      budget_pct: pct,
      budget_status: status,
    };

    if (config.logFormat === 'json') {
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      this.prettyBudget(spent, limit, pct, status, period);
    }
  }

  /**
   * Log a generic message
   */
  log(msg: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (config.logFormat === 'json') {
      process.stdout.write(JSON.stringify({
        level,
        event: 'message',
        ts: new Date().toISOString(),
        msg,
      }) + '\n');
      return;
    }

    const prefix = level === 'error'
      ? chalk.red('✖')
      : level === 'warn'
        ? chalk.yellow('⚠')
        : chalk.blue('ℹ');

    const ts = chalk.gray(new Date().toLocaleTimeString());
    process.stdout.write(`${ts} ${prefix} ${msg}\n`);
  }

  /**
   * Log startup banner
   */
  logStartup(port: number, upstreamUrl: string, modelMapSummary?: string): void {
    if (config.logFormat === 'json') return;

    const lines: string[] = [];
    lines.push(chalk.bold.cyan('╔══════════════════════════════════════════════════════╗'));
    lines.push(chalk.bold.cyan('║') + '   ' + chalk.bold.white('ccgate') + ' ' + chalk.dim('v0.1.0') + '  —  ' + chalk.dim('LLM Cost Proxy') + '                      ' + chalk.bold.cyan('║'));
    lines.push(chalk.bold.cyan('╠══════════════════════════════════════════════════════╣'));
    lines.push(chalk.bold.cyan('║') + '  ' + chalk.green('▶') + '  Proxy:    ' + chalk.yellow(`http://localhost:${port}/v1`) + ' '.repeat(26 - String(port).length) + chalk.bold.cyan('║'));
    lines.push(chalk.bold.cyan('║') + '  ' + chalk.green('▲') + '  Upstream: ' + chalk.dim(upstreamUrl) + ' '.repeat(9) + chalk.bold.cyan('║'));

    if (modelMapSummary) {
      // Split long model map strings across multiple lines if needed
      const maxLen = 42;
      const fullText = chalk.cyan(modelMapSummary);
      if (fullText.length <= maxLen) {
        lines.push(chalk.bold.cyan('║') + '  ' + chalk.green('⇄') + '  Models:   ' + fullText + ' '.repeat(Math.max(0, maxLen - modelMapSummary.length)) + chalk.bold.cyan('║'));
      } else {
        lines.push(chalk.bold.cyan('║') + '  ' + chalk.green('⇄') + '  Models:   ' + chalk.cyan(modelMapSummary.slice(0, 42)) + chalk.bold.cyan('║'));
        lines.push(chalk.bold.cyan('║') + '            ' + chalk.cyan(modelMapSummary.slice(42, 84)) + ' '.repeat(Math.max(0, 84 - modelMapSummary.length)) + chalk.bold.cyan('║'));
      }
    }

    lines.push(chalk.bold.cyan('║') + '  ' + chalk.green('⬤') + '  Budget:   ' + chalk.yellow(`$${config.dailyBudget}`) + '/day  ' + chalk.yellow(`$${config.monthlyBudget}`) + '/month' + ' '.repeat(12) + chalk.bold.cyan('║'));
    lines.push(chalk.bold.cyan('╚══════════════════════════════════════════════════════╝'));

    process.stdout.write('\n' + lines.join('\n') + '\n\n');
  }

  // ── Private ──────────────────────────────────────────────

  private prettyRequest(e: LogEntry): void {
    const ts = chalk.gray(new Date(e.ts as string).toLocaleTimeString());
    const session = chalk.cyan(e.session);
    const model = chalk.magenta((e.model || 'unknown').padEnd(22));
    const tokens = `${chalk.yellow(String(e.tokens_in).padStart(6))} ${chalk.dim('→')} ${chalk.yellow(String(e.tokens_out).padEnd(6))}`;
    const cost = chalk.green(`$${e.cost!.toFixed(6)}`);
    const total = chalk.dim(`(session: $${(e.session_total as number).toFixed(4)})`);

    process.stdout.write(`${ts} ${session} ${model} ${tokens} ${cost} ${total}\n`);
  }

  private prettyBudget(spent: number, limit: number, pct: number, status: string, period: string): void {
    const color = pct >= 100 ? chalk.red : pct >= 95 ? chalk.red : pct >= 80 ? chalk.yellow : chalk.green;
    const bar = this.makeBar(pct, color);

    const icon = status === 'exceeded' ? '🔴' : status === 'critical' ? '🟠' : status === 'warning' ? '🟡' : '🟢';
    const ts = chalk.gray(new Date().toLocaleTimeString());

    process.stdout.write(
      `${ts} ${icon} Budget ${period}: ${color(`$${spent.toFixed(2)} / $${limit.toFixed(2)}`)} ${bar} ${color(`${pct}%`)}\n`
    );
  }

  private makeBar(pct: number, color: (s: string) => string): string {
    const width = 10;
    const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
    const empty = width - filled;
    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
}

// ── UI mode: redirect output from stdout to file ──────────────

let uiRedirectToFile: string | null = null;

/**
 * In TUI/watch mode, the dashboard owns stdout. Redirect all proxy
 * log output to a file instead of stdout to avoid screen corruption.
 */
export function setUiLogFile(path: string | null): void {
  uiRedirectToFile = path;
}

function writeLog(s: string): void {
  if (uiRedirectToFile) {
    try {
      appendFileSync(uiRedirectToFile, s);
    } catch { /* ignore write errors */ }
  } else {
    process.stdout.write(s);
  }
}

/** Singleton logger instance */
export const logger = new Logger();

// Override methods to use writeLog instead of direct stdout
const _origLog = logger.log.bind(logger);
const _origLogRequest = logger.logRequest.bind(logger);
const _origLogBudget = logger.logBudget.bind(logger);

logger.log = function (msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  if (uiRedirectToFile) {
    writeLog(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}\n`);
    return;
  }
  _origLog(msg, level);
};

logger.logRequest = function (m: any, sid: string, dur: number, cost: number) {
  if (uiRedirectToFile) {
    writeLog(`[${new Date().toISOString()}] REQUEST ${sid.slice(0,8)} ${m.model} in=${m.inputTokens} out=${m.outputTokens} $${cost.toFixed(6)} ${dur}ms\n`);
    return;
  }
  _origLogRequest(m, sid, dur, cost);
};

logger.logBudget = function (spent: number, limit: number, period: 'daily' | 'monthly') {
  if (uiRedirectToFile) {
    writeLog(`[${new Date().toISOString()}] BUDGET ${period} $${spent.toFixed(2)} / $${limit.toFixed(2)}\n`);
    return;
  }
  _origLogBudget(spent, limit, period);
};
