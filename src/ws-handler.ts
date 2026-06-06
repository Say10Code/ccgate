import { FastifyInstance, FastifyRequest } from 'fastify';
import { eventBus } from './event-bus.js';
import { getStats } from './session.js';
import { getBudgetSummary } from './budget.js';
import type { RequestStartEvent, RequestEndEvent, BudgetAlertEvent } from './event-bus.js';

export function registerWebSocket(server: FastifyInstance): void {
  server.get('/ws', { websocket: true }, (socket, _req: FastifyRequest) => {
    const handlers = {
      start: (e: RequestStartEvent) => { try { socket.send(JSON.stringify({ type: 'request:start', ...e })); } catch {} },
      end: (e: RequestEndEvent) => { try { socket.send(JSON.stringify({ type: 'request:end', ...e })); } catch {} },
      budget: (e: BudgetAlertEvent) => { try { socket.send(JSON.stringify({ type: 'budget:alert', ...e })); } catch {} },
    };
    eventBus.on('request:start', handlers.start); eventBus.on('request:end', handlers.end); eventBus.on('budget:alert', handlers.budget);
    const statsTimer = setInterval(() => { try { socket.send(JSON.stringify({ type: 'stats:update', stats: getStats(), budget: getBudgetSummary() })); } catch {} }, 2000);
    socket.on('close', () => { clearInterval(statsTimer); eventBus.off('request:start', handlers.start); eventBus.off('request:end', handlers.end); eventBus.off('budget:alert', handlers.budget); });
  });
}
