import { EventEmitter } from 'events';
import { UsageMetrics } from './sse-interceptor.js';

// ── Event types ───────────────────────────────────────────────

export interface RequestStartEvent {
  sessionId: string;
  originalModel: string;
  remappedModel: string;
  timestamp: number;
}

export interface RequestEndEvent {
  sessionId: string;
  metrics: UsageMetrics;
  originalModel: string;
  durationMs: number;
  cost: number;
  timestamp: number;
}

export interface BudgetAlertEvent {
  period: 'daily' | 'monthly';
  spent: number;
  limit: number;
  pct: number;
  status: string;
}

export interface ProxyEvent {
  event: string;
  data: unknown;
}

/**
 * Singleton event bus — proxy emits events, TUI/dashboard consume them.
 */
class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // ── Typed emit helpers ────────────────────────────────────

  emitRequestStart(e: RequestStartEvent): void {
    this.emit('request:start', e);
  }

  emitRequestEnd(e: RequestEndEvent): void {
    this.emit('request:end', e);
  }

  emitBudgetAlert(e: BudgetAlertEvent): void {
    this.emit('budget:alert', e);
  }

  emitProxyEvent(event: string, data: unknown): void {
    this.emit('proxy', { event, data } as ProxyEvent);
    // Also emit as a named event for convenience
    this.emit(event, data);
  }

  // ── Typed subscribe helpers ────────────────────────────────

  onRequestStart(cb: (e: RequestStartEvent) => void): void {
    this.on('request:start', cb);
  }

  onRequestEnd(cb: (e: RequestEndEvent) => void): void {
    this.on('request:end', cb);
  }

  onBudgetAlert(cb: (e: BudgetAlertEvent) => void): void {
    this.on('budget:alert', cb);
  }
}

export const eventBus = EventBus.getInstance();
