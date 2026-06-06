import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import StatCard from '../components/StatCard';
import BudgetGauge from '../components/BudgetGauge';
import CostChart from '../components/CostChart';
import SessionsList from '../components/SessionsList';
import LiveFeed from '../components/LiveFeed';
import RequestsTable from '../components/RequestsTable';
import { fetchStats, fetchSessions, fetchCostHistory, type StatsData, type BudgetState, type SessionData, type CostPoint } from '../api';

export default function Dashboard() {
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState('00:00:00');
  const [serverStart, setServerStart] = useState<number>(Date.now());
  const [stats, setStats] = useState<StatsData | null>(null);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [costHistory, setCostHistory] = useState<CostPoint[]>([]);

  // Fetch server start time ONCE for accurate uptime
  useEffect(() => {
    fetch('/health').then(r => r.json()).then(d => {
      if (d.started_at) setServerStart(d.started_at);
    }).catch(() => {});
  }, []);

  // Uptime clock — based on SERVER start time, survives page refresh
  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - serverStart) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setUptime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [serverStart]);

  // WebSocket for real-time stats push
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'stats:update') {
          setStats(msg.stats);
          setBudget(msg.budget);
        }
      } catch {}
    };
    return () => { ws.close(); setConnected(false); };
  }, []);

  // Polling fallback for stats
  useEffect(() => {
    const poll = async () => {
      try { const d = await fetchStats(); setStats(d.stats); setBudget(d.budget); } catch {}
    };
    poll();
    const t = setInterval(poll, connected ? 10000 : 3000);
    return () => clearInterval(t);
  }, [connected]);

  // Load sessions
  useEffect(() => {
    (async () => {
      try { setSessions(await fetchSessions()); } catch {}
      setSessLoading(false);
    })();
    const t = setInterval(async () => {
      try { setSessions(await fetchSessions()); } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, []);

  // Load cost history
  useEffect(() => {
    (async () => {
      try { setCostHistory(await fetchCostHistory(24)); } catch {}
    })();
    const t = setInterval(async () => {
      try { setCostHistory(await fetchCostHistory(24)); } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const s = stats;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar connected={connected} uptime={uptime} />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="💰 Today" value={s ? '$' + s.today_cost.toFixed(4) : '...'} icon="💵" color="green" />
          <StatCard label="📊 Requests" value={s ? String(s.total_requests) : '...'} icon="📊" color="cyan" />
          <StatCard label="⚡ Tokens" value={s ? fmtTok(s.total_tokens) : '...'} icon="⚡" color="yellow" />
          <StatCard label="👥 Active Sessions" value={s ? String(s.active_sessions) : '...'} icon="👥" color="purple" />
          <StatCard label="🗂 Projects" value={String(new Set(sessions.map(s => s.projectPath)).size)} icon="📁" color="zinc" />
        </div>

        {/* Chart + Budget */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <CostChart data={costHistory} />
          </div>
          <div>
            {budget && <BudgetGauge daily={budget.daily} monthly={budget.monthly} />}
          </div>
        </div>

        {/* Sessions list */}
        <SessionsList sessions={sessions} loading={sessLoading} />

        {/* Live Feed + Requests */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LiveFeed />
          <RequestsTable />
        </div>
      </div>
    </div>
  );
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
