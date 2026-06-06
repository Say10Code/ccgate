export interface CountRow { c: number }
export interface SumRow { t: number; total: number }
export interface ModelRow { model: string; requests: number; tokens: number; cost: number }
export interface CostHistoryRow { hour: string; cost: number; requests: number }
export interface BudgetRow { id: number; daily_limit: number; monthly_limit: number; daily_spent: number; monthly_spent: number; last_daily_reset: string; last_monthly_reset: string; updated_at: string }
export interface ProxyRequestBody { model?: string; stream?: boolean; messages?: Array<{ role: string; content: string }>; max_tokens?: number; system?: unknown; tools?: unknown[]; [key: string]: unknown }
