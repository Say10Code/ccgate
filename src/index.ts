#!/usr/bin/env node
import { createServer } from './proxy.js';
import { config } from './config.js';
import { logger, setUiLogFile } from './logger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import { execSync } from 'child_process';
import { getDb } from './db.js';
import { startDiscoveryScan } from './discovery-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantTui = args.includes('--tui') || args.includes('-t') || process.env.CCGATE_TUI === 'true';
const wantWatch = args.includes('--watch') || args.includes('-w');
const isUi = wantTui || wantWatch;

// ── Port management ───────────────────────────────────────────

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => { s.close(); resolve(false); });
    s.listen(port, '127.0.0.1');
  });
}

function killPortWindows(port: number): void {
  if (process.platform !== 'win32') return;
  try {
    // Find PID, kill it
    const r = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf-8', timeout: 3000, windowsHide: true,
    });
    const match = r.match(/(\d+)\s*$/m);
    if (match) {
      execSync(`taskkill /PID ${match[1]} /F`, { timeout: 3000, windowsHide: true });
    }
  } catch {
    // Non-fatal — port may be free or we can't kill it
  }
}

// ── Banner ────────────────────────────────────────────────────

function getModelMapSummary(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', 'pricing.json'), 'utf-8');
    const pricing = JSON.parse(raw);
    const map = pricing.model_map || {};
    const entries = Object.entries(map) as [string, string][];
    return entries.filter(([f]) => f.startsWith('claude-')).map(([f, t]) => `${f}→${t}`).slice(0, 3).join(', ');
  } catch {
    return 'claude-* → deepseek-v4-flash';
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ═══ Init DB early (ensures ~/.ccgate exists) ═══════════════
  getDb();

  // ═══ Banner (skip in UI modes — TUI/watch are the UI) ══════
  if (!isUi) {
    logger.logStartup(config.port, config.upstreamUrl, getModelMapSummary());
  }

  // ═══ Validate pricing ═══════════════════════════════════════
  try {
    const raw = readFileSync(join(__dirname, '..', 'pricing.json'), 'utf-8');
    const pricing = JSON.parse(raw);
    const mc = Object.keys(pricing.models).filter((k: string) => !k.startsWith('_')).length;
    const mp = Object.keys(pricing.model_map || {}).length;
    if (!isUi) logger.log(`Loaded ${mc} models + ${mp} name mappings`);
  } catch {
    if (!isUi) logger.log('WARN: pricing.json not loaded', 'warn');
  }

  // ═══ Port check + auto-clean ════════════════════════════════
  const portBlocked = await checkPort(config.port);
  if (portBlocked) {
    if (isUi) {
      process.stderr.write(`Port ${config.port} occupied — killing old proxy...\n`);
    } else {
      logger.log(`Port ${config.port} occupied — killing old proxy...`, 'warn');
    }
    killPortWindows(config.port);

    // Re-check
    const stillBlocked = await checkPort(config.port);
    if (stillBlocked) {
      const msg = `Port ${config.port} still in use. Run manually:\n` +
        `  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${config.port}).OwningProcess -Force`;
      if (isUi) process.stderr.write(msg + '\n');
      else logger.log(msg, 'error');
      process.exit(1);
    }
  }

  // ═══ Start server ═══════════════════════════════════════════
  const server = createServer();

  // Cleanup on signals
  for (const sig of ['SIGINT', 'SIGTERM'] as NodeJS.Signals[]) {
    process.on(sig, () => {
      if (isUi) {
        // TUI/watch handles its own cleanup
        process.exit(0);
      } else {
        logger.log(`${sig} — shutting down`, 'warn');
        server.close().then(() => process.exit(0));
      }
    });
  }

  try {
    await server.listen({ port: config.port, host: '127.0.0.1' });

    startDiscoveryScan();

    // Session auto-complete after 1h inactivity
    const sessionTtl = parseInt(process.env.CCGATE_SESSION_TTL || '3600000', 10);
    setInterval(() => {
      try {
        const db = getDb();
        db.prepare("UPDATE sessions SET status = 'completed' WHERE status = 'active' AND last_active < ?")
          .run(new Date(Date.now() - sessionTtl).toISOString());
      } catch {}
    }, 600_000).unref();

    if (wantTui || wantWatch) {
      const { startWatch } = await import('./tui.js');
      setUiLogFile(join(config.dataDir, 'ccgate.log'));
      setTimeout(() => startWatch(), 100);
    } else {
      logger.log(`Listening on http://127.0.0.1:${config.port}/v1`);
      logger.log(`ANTHROPIC_BASE_URL=http://127.0.0.1:${config.port}/v1`);
      logger.log('npm run tui | npm run watch');
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (isUi) process.stderr.write(`FAIL: ${msg}\n`);
    else logger.log(`FAIL: ${msg}`, 'error');
    process.exit(1);
  }
}

main();
