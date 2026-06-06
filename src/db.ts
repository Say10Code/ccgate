import Database from 'better-sqlite3';
import { config } from './config.js';
import { mkdirSync, existsSync } from 'fs';

let db: Database.Database;
let dbPathOverride: string | null = null;

/**
 * Override DB path — used by tests to avoid polluting production data.
 */
export function setDbPath(path: string): void {
  dbPathOverride = path;
  // Close existing connection if any
  if (db) {
    db.close();
    (db as any) = undefined;
  }
}

/**
 * Open (or create) the SQLite database in WAL mode.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = dbPathOverride || `${config.dataDir}/ccgate.db`;

  // Ensure parent directory exists
  const parent = dbPath.replace(/\/[^/]+$/, '');
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  return db;
}

/**
 * Run schema migrations idempotently.
 */
function runMigrations(database: Database.Database): void {
  // ── Sessions ────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      request_count INTEGER NOT NULL DEFAULT 0,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      total_cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0.0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed'))
    );
  `);

  // ── Requests ────────────────────────────────────────────
  // Note: NO message content is stored — only accounting metadata.
  // API keys are NEVER persisted.
  database.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      original_model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0.0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      is_streaming INTEGER NOT NULL DEFAULT 1,
      status_code INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // ── Budget ──────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
      daily_limit REAL NOT NULL DEFAULT 5.00,
      monthly_limit REAL NOT NULL DEFAULT 50.00,
      daily_spent REAL NOT NULL DEFAULT 0.0,
      monthly_spent REAL NOT NULL DEFAULT 0.0,
      last_daily_reset TEXT NOT NULL DEFAULT (date('now')),
      last_monthly_reset TEXT NOT NULL DEFAULT (date('now','start of month')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed budget row if not present
  database.exec(`
    INSERT OR IGNORE INTO budget (id, daily_limit, monthly_limit)
    VALUES (1, ${config.dailyBudget}, ${config.monthlyBudget});
  `);

  // ── Indexes ─────────────────────────────────────────────
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_id);
    CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active);
  `);
}

/**
 * Close the database cleanly.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    (db as any) = undefined;
  }
}
