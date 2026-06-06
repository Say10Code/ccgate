import React, { useState } from 'react';
import type { SessionData } from '../api';

interface Props {
  sessions: SessionData[];
  loading: boolean;
}

export default function SessionsList({ sessions, loading }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const openFolder = (path: string) => {
    setOpening(path);
    fetch(`/api/open-folder?path=${encodeURIComponent(path)}`)
      .catch(() => {})
      .finally(() => setTimeout(() => setOpening(null), 1500));
  };

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm text-zinc-400 mb-2">🖥 Claude Code Sessions</h3>
        <div className="text-zinc-600 text-sm py-4">Loading sessions...</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm text-zinc-400 mb-2">🖥 Claude Code Sessions</h3>
        <div className="text-zinc-600 text-sm py-4">No sessions found</div>
      </div>
    );
  }

  // Group by project path
  const projects = new Map<string, SessionData[]>();
  for (const s of sessions) {
    const key = s.projectPath || '(unknown)';
    if (!projects.has(key)) projects.set(key, []);
    projects.get(key)!.push(s);
  }

  const hasProxy = sessions.filter(s => s.proxyData).length;
  const projectCount = projects.size;
  const displayProjects = expanded ? [...projects.entries()] : [];

  // Column widths (CSS-style)
  const colName = { minWidth: '160px', maxWidth: '240px' };
  const colModel = { minWidth: '100px', maxWidth: '140px' };
  const colMsgs = { width: '52px' };
  const colCost = { width: '80px' };
  const colTime = { width: '70px' };

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-zinc-400">
          🖥 Claude Code Sessions on This PC
          <span className="text-zinc-600 ml-2">
            ({hasProxy} traced / {sessions.length} sessions / {projectCount} projects)
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              expanded
                ? 'border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600'
                : 'border-cyan-800 text-cyan-400 hover:text-cyan-300'
            }`}
          >
            {expanded ? '▲ collapse' : `▼ show all ${projectCount}`}
          </button>
          {expanded && (
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              {showSessions ? '⊟ hide sessions' : '⊞ show sessions'}
            </button>
          )}
        </div>
      </div>

      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-zinc-600 font-mono border-b border-zinc-800/30 mb-2">
        <span className="w-4" />
        <span style={colName}>name</span>
        <span style={colModel}>model</span>
        <span className="text-right" style={colMsgs}>msgs</span>
        <span className="text-right" style={colCost}>cost</span>
        <span className="text-right" style={colTime}>last seen</span>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {displayProjects.map(([projectPath, projectSessions]) => {
          // Project-level aggregates
          const totalMsgs = projectSessions.reduce((sum, s) => sum + s.messageCount, 0);
          const totalCost = projectSessions.reduce((sum, s) => sum + (s.proxyData?.totalCost || 0), 0);
          const hasData = totalCost > 0;

          // Last interaction time = newest lastSeen in the project
          const newestSeen = projectSessions
            .map(s => s.lastSeen)
            .filter(Boolean)
            .sort((a, b) => (b || '').localeCompare(a || ''))[0] || null;

          return (
            <div key={projectPath} className="border border-zinc-800/50 rounded bg-zinc-900/50 overflow-hidden">
              {/* ── PROJECT ROW ──────────────────────────────── */}
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/80">
                {/* Clickable folder path */}
                <button
                  onClick={() => openFolder(projectPath)}
                  disabled={opening === projectPath}
                  className="flex items-center gap-2 flex-1 min-w-0 group hover:bg-zinc-800/60 rounded px-2 py-1 -mx-2 transition-colors disabled:opacity-50"
                  title={opening === projectPath ? 'Opening...' : 'Open in Explorer'}
                >
                  <span className="text-sm shrink-0">{hasData ? '🟢' : '⚪'}</span>
                  <span className="text-zinc-200 text-xs font-mono truncate group-hover:text-cyan-300 transition-colors">
                    {projectPath === '(unknown)' ? '(path unknown)' : projectPath}
                  </span>
                  <span className="text-zinc-600 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-1 shrink-0">
                    📂 {opening === projectPath ? 'opening...' : 'open'}
                  </span>
                </button>

                {/* Project metrics */}
                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="text-zinc-400 text-right" style={colMsgs}>
                    {fmtNum(totalMsgs)}
                  </span>
                  <span className={hasData ? 'text-green-400' : 'text-zinc-600'} style={{ ...colCost, textAlign: 'right' }}>
                    {hasData ? '$' + totalCost.toFixed(4) : '—'}
                  </span>
                  <span className="text-zinc-500 text-right" style={colTime}>
                    {fmtSince(newestSeen)}
                  </span>
                </div>
              </div>

              {/* ── SESSION ROWS ────────────────────────────── */}
              {showSessions && (
                <div className="divide-y divide-zinc-800/30">
                  {projectSessions.map(s => {
                    const label = s.name || s.sessionId.slice(0, 8);
                    const sessCost = s.proxyData?.totalCost || 0;
                    const hasSessionData = (s.proxyData?.requests || 0) > 0;
                    return (
                      <div key={s.sessionId} className="flex items-center gap-2 pl-6 pr-3 py-1.5 hover:bg-zinc-800/20 text-xs">
                        <span className={hasSessionData ? 'text-green-500 text-[10px]' : 'text-zinc-700 text-[10px]'} style={{ width: '12px' }}>
                          ●
                        </span>
                        <span className="text-zinc-300 font-mono truncate" style={colName} title={label + ' — ' + s.sessionId}>
                          {label}
                        </span>
                        <span className="text-zinc-600 font-mono text-[11px] truncate" style={colModel} title={s.model || undefined}>
                          {s.model || '—'}
                        </span>
                        <span className="text-zinc-500 font-mono text-right" style={colMsgs}>
                          {fmtNum(s.messageCount)}
                        </span>
                        <span className="font-mono text-right" style={{ ...colCost, color: hasSessionData ? '#4ade80' : '#52525b' }}>
                          {hasSessionData ? '$' + sessCost.toFixed(4) : '—'}
                        </span>
                        <span className="text-zinc-500 font-mono text-right" style={colTime}>
                          {fmtSince(s.lastSeen)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtSince(iso: string | null): string {
  if (!iso) return '—';
  const ts = iso.endsWith('Z') ? iso : iso + 'Z';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return '—';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}
