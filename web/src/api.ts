// ── ccgate API client ─────────────────────────────────────────

const BASE = '/api';

export interface SessionData {
  sessionId: string;
  name: string | null;
  projectPath: string | null;
  gitBranch: string | null;
  messageCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  model: string | null;
  proxyData: { requests: number; totalTokens: number; totalCost: number } | null;
}

export interface RequestRecord {
  id: number;
  session_id: string;
  model: string;
  original_model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  duration_ms: number;
  created_at: string;
}

export interface StatsData {
  total_sessions: number;
  active_sessions: number;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  today_cost: number;
  month_cost: number;
}

export interface BudgetState {
  daily: { spent: number; limit: number; pct: number; status: string };
  monthly: { spent: number; limit: number; pct: number; status: string };
  overall: string;
}

export interface ModelBreakdown {
  model: string; requests: number; tokens: number; cost: number;
}

export interface CostPoint {
  hour: string; cost: number; requests: number;
}

export async function fetchSessions(): Promise<SessionData[]> {
  const r = await fetch(`${BASE}/sessions/all`);
  const d = await r.json();
  return d.sessions || [];
}

export async function fetchStats(): Promise<{ stats: StatsData; budget: BudgetState }> {
  const r = await fetch('/stats');
  return r.json();
}

export async function fetchRequests(limit = 50): Promise<{ requests: RequestRecord[]; total: number }> {
  const r = await fetch(`${BASE}/requests?limit=${limit}`);
  return r.json();
}

export async function fetchModels(): Promise<ModelBreakdown[]> {
  const r = await fetch(`${BASE}/models`);
  const d = await r.json();
  return d.models || [];
}

export async function fetchCostHistory(hours = 24): Promise<CostPoint[]> {
  const r = await fetch(`${BASE}/charts/cost-history?hours=${hours}`);
  const d = await r.json();
  return d.history || [];
}
