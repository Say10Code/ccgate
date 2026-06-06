import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../components/Navbar'; import StatCard from '../components/StatCard';
import BudgetGauge from '../components/BudgetGauge'; import CostChart from '../components/CostChart';
import SessionsList from '../components/SessionsList'; import LiveFeed from '../components/LiveFeed';
import RequestsTable from '../components/RequestsTable'; import { ErrorBoundary } from '../components/ErrorBoundary';
import { useToast } from '../components/Toast';
import { fetchStats, fetchSessions, fetchCostHistory, type StatsData, type BudgetState, type SessionData, type CostPoint } from '../api';

export default function Dashboard() {
  const [connected, setConnected] = useState(false); const [uptime, setUptime] = useState('00:00:00');
  const [serverStart, setServerStart] = useState<number>(Date.now());
  const [stats, setStats] = useState<StatsData|null>(null); const [budget, setBudget] = useState<BudgetState|null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]); const [sessLoading, setSessLoading] = useState(true);
  const [costHistory, setCostHistory] = useState<CostPoint[]>([]); const toast = useToast();

  useEffect(()=>{ fetch('/health').then(r=>r.json()).then(d=>{if(d.started_at)setServerStart(d.started_at)}).catch(()=>{}); },[]);
  useEffect(()=>{ const t=()=>{ const s=Math.floor((Date.now()-serverStart)/1000); setUptime(`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`); }; t(); const i=setInterval(t,1000); return ()=>clearInterval(i); },[serverStart]);

  useEffect(()=>{ const p=location.protocol==='https:'?'wss:':'ws:'; let ws:WebSocket; let rt:ReturnType<typeof setTimeout>;
    function c(){ ws=new WebSocket(`${p}//${location.host}/ws`); ws.onopen=()=>setConnected(true); ws.onclose=()=>{setConnected(false);rt=setTimeout(c,3000)}; ws.onmessage=e=>{try{const m=JSON.parse(e.data); if(m.type==='stats:update'){setStats(m.stats);setBudget(m.budget)}}catch{}}; } c(); return()=>{ws?.close();clearTimeout(rt);setConnected(false)}; },[]);
  useEffect(()=>{ const p=async()=>{try{const d=await fetchStats();setStats(d.stats);setBudget(d.budget)}catch{}}; p(); const i=setInterval(p,connected?10000:3000); return()=>clearInterval(i); },[connected]);
  useEffect(()=>{ (async()=>{try{setSessions(await fetchSessions())}catch{};setSessLoading(false)})(); const i=setInterval(async()=>{try{setSessions(await fetchSessions())}catch{}},15000); return()=>clearInterval(i); },[]);
  useEffect(()=>{ (async()=>{try{setCostHistory(await fetchCostHistory(24))}catch{}})(); const i=setInterval(async()=>{try{setCostHistory(await fetchCostHistory(24))}catch{}},30000); return()=>clearInterval(i); },[]);

  const exportData = useCallback(async (fmt:'csv'|'json')=>{ try{ const r=await fetch(`/api/export?format=${fmt}&days=30`);
    if(fmt==='csv'){ const b=await r.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download='ccgate-export.csv'; a.click(); URL.revokeObjectURL(u); }
    else{ const d=await r.json(); const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download='ccgate-export.json'; a.click(); URL.revokeObjectURL(u); }
    toast.show(`Exported ${fmt.toUpperCase()} ✓`); } catch { toast.show('Export failed','error'); } },[toast]);

  const s=stats; const pc=new Set(sessions.map(s=>s.projectPath)).size;

  return <div className="min-h-screen bg-zinc-950">
    <Navbar connected={connected} uptime={uptime}>
      <button onClick={()=>exportData('csv')} className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors">📥 CSV</button>
      <button onClick={()=>exportData('json')} className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors">📥 JSON</button>
    </Navbar>
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <ErrorBoundary label="Stats"><div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="💰 Today" value={s?'$'+s.today_cost.toFixed(4):'...'} rawValue={s?.today_cost} icon="💵" color="green" />
        <StatCard label="📊 Requests" value={s?String(s.total_requests):'...'} rawValue={s?.total_requests} icon="📊" color="cyan" />
        <StatCard label="⚡ Tokens" value={s?String(s.total_tokens):'...'} rawValue={s?.total_tokens} icon="⚡" color="yellow" />
        <StatCard label="👥 Sessions" value={s?String(s.active_sessions):'...'} rawValue={s?.active_sessions} icon="👥" color="purple" />
        <StatCard label="🗂 Projects" value={String(pc)} rawValue={pc} icon="📁" color="zinc" />
      </div></ErrorBoundary>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2"><ErrorBoundary label="Chart"><CostChart data={costHistory} /></ErrorBoundary></div>
        <div><ErrorBoundary label="Budget">{budget&&<BudgetGauge daily={budget.daily} monthly={budget.monthly} />}</ErrorBoundary></div>
      </div>
      <ErrorBoundary label="Sessions"><SessionsList sessions={sessions} loading={sessLoading} /></ErrorBoundary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ErrorBoundary label="LiveFeed"><LiveFeed /></ErrorBoundary>
        <ErrorBoundary label="Requests"><RequestsTable /></ErrorBoundary>
      </div>
    </div>
  </div>;
}
