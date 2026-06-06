/**
 * Claude Code Session Discovery
 *
 * Scans ~/.claude/projects/ to find ALL Claude Code sessions on this PC.
 * Extracts session name, project path, git branch, message count, and model
 * from JSONL files. Cross-references with ccgate SQLite for token/cost data.
 *
 * Key insight: JSONL files contain system events at the start that include:
 *   - cwd (project path)
 *   - sessionId
 *   - gitBranch
 *   - /rename event → session name
 *
 * We read only the first ~50 lines (and last line) of each JSONL to get
 * metadata, avoiding loading multi-MB files into memory.
 */

import { createReadStream, readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import os from 'os';
import { getDb } from './db.js';

// ── Types ─────────────────────────────────────────────────────

export interface DiscoveredSession {
  sessionId: string;
  name: string | null;
  projectPath: string | null;
  gitBranch: string | null;
  messageCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  model: string | null;
  /** Data from ccgate SQLite (null = never used through proxy) */
  proxyData: {
    requests: number;
    totalTokens: number;
    totalCost: number;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(os.homedir(), '.claude', 'projects');
const MAX_SCAN_LINES = 300;  // read first 300 lines for metadata (was 100)
const TAIL_LINES = 5;        // read last 5 lines for final timestamp

// ── Single JSONL parser ──────────────────────────────────────

async function scanJsonl(filePath: string): Promise<DiscoveredSession | null> {
  let sessionId = basename(filePath).replace('.jsonl', '');
  if (!sessionId || sessionId.length < 10) return null;

  const session: DiscoveredSession = {
    sessionId,
    name: null,
    projectPath: null,
    gitBranch: null,
    messageCount: 0,
    firstSeen: null,
    lastSeen: null,
    model: null,
    proxyData: null,
  };

  let lineCount = 0;

  try {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      lineCount++;
      session.messageCount = lineCount;

      // Only parse first MAX_SCAN_LINES for metadata
      if (lineCount <= MAX_SCAN_LINES) {
        try {
          const entry = JSON.parse(line);

          if (!session.projectPath && entry.cwd) {
            session.projectPath = entry.cwd;
          }
          if (!session.gitBranch && entry.gitBranch) {
            session.gitBranch = entry.gitBranch;
          }
          if (!session.firstSeen && entry.timestamp) {
            session.firstSeen = entry.timestamp;
          }

          // Extract session name from /rename event
          if (!session.name && entry.type === 'system' && entry.subtype === 'local_command') {
            const content: string = entry.content || '';
            if (content.includes('<command-name>/rename</command-name>')) {
              // Name is in <command-args> of /rename
              const argsMatch = content.match(/<command-args>([^<]*)<\/command-args>/);
              if (argsMatch && argsMatch[1].trim()) {
                session.name = argsMatch[1].trim();
              }
            }
            // Also check stdout result (separate entry, still subtype=local_command)
            const stdoutMatch = content.match(/Session renamed to:\s*(.+?)<\/local-command-stdout>/);
            if (stdoutMatch && stdoutMatch[1].trim()) {
              session.name = stdoutMatch[1].trim();
            }
          }

          // Extract session name from system reminder
          if (!session.name && entry.type === 'user' && entry.isMeta) {
            const msgContent = entry.message?.content || '';
            const namedMatch = msgContent.match(/named this session\s*"([^"]+)"/);
            if (namedMatch) {
              session.name = namedMatch[1].trim();
            }
          }

          // Extract model from assistant messages
          if (!session.model && entry.message?.model) {
            session.model = entry.message.model;
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Stop reading if we found all metadata
      if (lineCount >= MAX_SCAN_LINES && session.name && session.projectPath && session.model) {
        break;
      }
    }

    // Get last timestamp via tail reading
    session.lastSeen = session.firstSeen; // fallback

    // If we didn't get a name, derive from project path
    if (!session.name && session.projectPath) {
      // Extract last meaningful directory from project path
      const parts = session.projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      // Use the project folder name as session name (much better than UUID)
      if (last && last.length > 0) {
        session.name = last;
      }
    }

    // Absolute fallback: first 8 chars of UUID
    if (!session.name) {
      session.name = sessionId.slice(0, 8);
    }

    return session;
  } catch {
    return null;
  }
}

// ── Directory scanner ─────────────────────────────────────────

async function scanProjectDir(dirPath: string): Promise<DiscoveredSession[]> {
  const results: DiscoveredSession[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const fullPath = join(dirPath, entry);
    try {
      const st = statSync(fullPath);
      if (!st.isFile() || st.size < 100) continue;
    } catch {
      continue;
    }

    const session = await scanJsonl(fullPath);
    if (session) results.push(session);
  }

  return results;
}

// ── Public API ─────────────────────────────────────────────────

export async function discoverAllSessions(): Promise<DiscoveredSession[]> {
  const allSessions: DiscoveredSession[] = [];

  // 1. Scan all project directories
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return allSessions;
  }

  for (const projDir of projectDirs) {
    const projPath = join(CLAUDE_PROJECTS_DIR, projDir);
    try {
      const st = statSync(projPath);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }

    const sessions = await scanProjectDir(projPath);
    allSessions.push(...sessions);
  }

  // 2. Enrich with ccgate proxy data
  const db = getDb();
  for (const session of allSessions) {
    const ccSession = db.prepare('SELECT request_count, total_input_tokens, total_output_tokens, total_cost FROM sessions WHERE id = ?').get(session.sessionId) as { request_count: number; total_input_tokens: number; total_output_tokens: number; total_cost: number } | undefined;
    if (ccSession && ccSession.request_count > 0) {
      session.proxyData = {
        requests: ccSession.request_count,
        totalTokens: ccSession.total_input_tokens + ccSession.total_output_tokens,
        totalCost: ccSession.total_cost,
      };
    }
  }

  // 3. Sort: proxy-tracked first, then by last seen
  allSessions.sort((a, b) => {
    const aHas = a.proxyData ? 1 : 0;
    const bHas = b.proxyData ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.lastSeen || '').localeCompare(a.lastSeen || '');
  });

  return allSessions;
}
