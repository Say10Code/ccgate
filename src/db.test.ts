import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, setDbPath } from './db.js';
import Database from 'better-sqlite3';
import { config } from './config.js';

describe('Database', () => {
  let db: Database.Database;

  beforeAll(() => {
    // Use separate test DB
    setDbPath(`${config.dataDir}/ccgate-test.db`);
    db = getDb();
  });

  afterAll(() => {
    closeDb();
  });

  it('opens database successfully', () => {
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('has WAL mode', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as any;
    expect(row.journal_mode).toBe('wal');
  });

  it('has foreign keys enabled', () => {
    const row = db.prepare('PRAGMA foreign_keys').get() as any;
    expect(row.foreign_keys).toBe(1);
  });

  it('has sessions table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get() as any;
    expect(row).toBeDefined();
  });

  it('has requests table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'").get() as any;
    expect(row).toBeDefined();
  });

  it('has budget table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='budget'").get() as any;
    expect(row).toBeDefined();
  });

  it('budget table has a singleton row (id=1)', () => {
    const row = db.prepare('SELECT * FROM budget WHERE id = 1').get() as any;
    expect(row).toBeDefined();
    expect(row.daily_limit).toBeGreaterThan(0);
    expect(row.monthly_limit).toBeGreaterThan(0);
  });
});
