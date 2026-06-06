import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { Readable } from 'stream';
import { config } from './config.js';
import { SSEInterceptor, UsageMetrics } from './sse-interceptor.js';
import { calculateCost } from './pricing.js';
import { logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import pricingData from '../pricing.json' with { type: 'json' };
import { recordRequest, getStats, getAllRequests, getModelBreakdown, getCostHistory, getSessionRequests, listSessions } from './session.js';
import { shouldBlock, logBudgetStatus, getBudgetSummary } from './budget.js';
import { eventBus } from './event-bus.js';
import { getSessions } from './discovery-cache.js';
import { registerWebSocket } from './ws-handler.js';
import type { ProxyRequestBody } from './types.js';
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_START_TIME = Date.now();

// ── Pricing data type ───────────────────────────────────────────
interface PricingSchema { model_map?: Record<string, string>; models?: Record<string, unknown> }
const PD = pricingData as unknown as PricingSchema;

// ── File logger ─────────────────────────────────────────────────

function logToFileFn(msg: string): void {
  try {
    const dir = join(config.dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'requests.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// ── Model mapping ──────────────────────────────────────────────

type ModelMap = Record<string, string>;

function loadModelMap(): ModelMap {
  const map: ModelMap = {};
  const raw = PD.model_map || {};
  for (const [key, value] of Object.entries(raw)) {
    map[key.toLowerCase()] = value as string;
  }
  return map;
}

const MODEL_MAP = loadModelMap();

export function remapModel(originalModel: string): { remapped: string; original: string } {
  const clean = originalModel.replace(/\[.*\]/, '').replace(/@.*$/, '').trim();
  const lower = clean.toLowerCase();
  if (MODEL_MAP[lower]) return { remapped: MODEL_MAP[lower], original: originalModel };

  let bestMatch: string | undefined;
  for (const [key] of Object.entries(MODEL_MAP)) {
    if (lower.startsWith(key) && (!bestMatch || key.length > bestMatch.length)) {
      bestMatch = key;
    }
  }
  if (bestMatch) return { remapped: MODEL_MAP[bestMatch], original: originalModel };

  const knownModels = PD.models || {};
  const isKnownDS = lower in knownModels || Object.values(MODEL_MAP).some(v => v === lower);
  if (!isKnownDS) logger.log(`Unknown model "${originalModel}" — forwarding as-is`, 'warn');
  return { remapped: originalModel, original: originalModel };
}

// ── Server factory ─────────────────────────────────────────────

export function createServer(): FastifyInstance {
  const server = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024,
    requestTimeout: 10 * 60 * 1000,
  });

  // ── Plugins ─────────────────────────────────────────────────
  server.register(fastifyWebsocket);
  server.register(fastifyStatic, {
    root: join(__dirname, '..', 'web', 'dist'),
    prefix: '/',
    wildcard: false,
  });

  // ── Request logger ──────────────────────────────────────────
  server.addHook('onRequest', async (req: FastifyRequest) => {
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/v1/')) return;
    logToFileFn(`→ ${req.method} ${req.url}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // ── Health ───────────────────────────────────────────────────
  server.get('/health', async () => ({
    status: 'ok',
    version: '0.3.0',
    started_at: SERVER_START_TIME,
    model_map: Object.entries(MODEL_MAP).filter(([k]) => k.startsWith('claude-')).map(([k, v]) => `${k}→${v}`).slice(0, 4).join(', '),
  }));

  // ── Stats ────────────────────────────────────────────────────
  server.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const stats = getStats();
    const budget = getBudgetSummary();
    return reply.send({ stats, budget });
  });

  // ── Open folder in Explorer (GET, query param — no JSON issues) ─
  server.get('/api/open-folder', async (req: FastifyRequest, reply: FastifyReply) => {
    const folderPath = (req.query as { path?: string })?.path;
    if (!folderPath) return reply.status(400).send({ error: 'path required' });
    try {
      const winPath = folderPath.replace(/\//g, '\\');
      exec(`start "" explorer "${winPath}"`, { windowsHide: true, shell: 'cmd.exe' }, (err) => {
        if (err) return reply.status(500).send({ error: err.message });
        return reply.send({ ok: true, path: winPath });
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── All sessions (discovery + ccgate DB) ─────────────────────
  server.get('/api/sessions/all', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await getSessions();
      return reply.send({ sessions });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Single session detail ────────────────────────────────────
  server.get('/api/sessions/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { getSession } = await import('./session.js');
    const session = getSession(id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    const requests = getSessionRequests(id, 100);
    return reply.send({ session, requests });
  });

  // ── Recent requests ──────────────────────────────────────────
  server.get('/api/requests', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(200, parseInt(query.limit || '50', 10));
    const offset = parseInt(query.offset || '0', 10);
    return reply.send(getAllRequests(limit, offset));
  });

  // ── Model breakdown ──────────────────────────────────────────
  server.get('/api/models', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ models: getModelBreakdown() });
  });

  // ── Cost history (chart data) ────────────────────────────────
  server.get('/api/charts/cost-history', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { hours?: string };
    const hours = Math.min(168, parseInt(query.hours || '24', 10));
    return reply.send({ history: getCostHistory(hours) });
  });

  // ── Export ────────────────────────────────────────────────────
  server.get('/api/export', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { format?: string; days?: string };
    const format = q.format || 'json';
    const days = Math.min(365, parseInt(q.days || '30', 10));
    const { requests } = getAllRequests(10000, 0);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = requests.filter(r => (r.created_at || '') >= cutoffStr);
    if (format === 'csv') {
      const csv = ['id,session_id,model,original_model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost,duration_ms,streaming,created_at',
        ...filtered.map(r => [r.id, r.session_id, r.model, r.original_model, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens, r.cost.toFixed(6), r.duration_ms, r.is_streaming ? 1 : 0, r.created_at].join(','))
      ].join('\n');
      return reply.type('text/csv').header('Content-Disposition', `attachment; filename="ccgate-export-${new Date().toISOString().slice(0,10)}.csv"`).send(csv);
    }
    return reply.send({ exported_at: new Date().toISOString(), days, count: filtered.length, requests: filtered });
  });

    // ── Budget ────────────────────────────────────────────────────
  server.get('/api/budget', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(getBudgetSummary());
  });

  // ── Debug ────────────────────────────────────────────────────
  server.get('/debug/test-upstream', async (req: FastifyRequest, reply: FastifyReply) => {
    const apiKey = (req.headers['x-api-key'] as string) || '';
    const results: any = {};
    try {
      const r = await fetch(`${config.upstreamUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'deepseek-v4-flash', max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }], stream: false }),
      });
      results.chat = { status: r.status, ok: r.ok };
    } catch (e: any) { results.chat = { error: e.message }; }
    return reply.send({ proxy: 'ccgate', upstream: config.upstreamUrl, results });
  });

  // ═══════════════════════════════════════════════════════════════
  // WEBSOCKET
  // ═══════════════════════════════════════════════════════════════

  server.get('/ws', { websocket: true }, (socket: any, _req: FastifyRequest) => {
    logToFileFn('WebSocket client connected');

    const onStart = (e: any) => {
      try { socket.send(JSON.stringify({ type: 'request:start', ...e })); } catch {}
    };
    const onEnd = (e: any) => {
      try { socket.send(JSON.stringify({ type: 'request:end', ...e })); } catch {}
    };
    const onBudget = (e: any) => {
      try { socket.send(JSON.stringify({ type: 'budget:alert', ...e })); } catch {}
    };

    eventBus.on('request:start', onStart);
    eventBus.on('request:end', onEnd);
    eventBus.on('budget:alert', onBudget);

    // Periodic stats push
    const statsTimer = setInterval(() => {
      try {
        socket.send(JSON.stringify({
          type: 'stats:update',
          stats: getStats(),
          budget: getBudgetSummary(),
        }));
      } catch {}
    }, 2000);

    socket.on('close', () => {
      clearInterval(statsTimer);
      eventBus.off('request:start', onStart);
      eventBus.off('request:end', onEnd);
      eventBus.off('budget:alert', onBudget);
      logToFileFn('WebSocket client disconnected');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MODEL ROUTES (Anthropic API proxy)
  // ═══════════════════════════════════════════════════════════════

  const handleModelsList = async (_req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
    for (const [claudeModel] of Object.entries(MODEL_MAP)) {
      if (claudeModel.startsWith('claude-')) {
        models.push({ id: claudeModel, object: 'model', created: 1700000000, owned_by: 'anthropic' });
      }
    }
    const pricingModels = (pricingData as any).models || {};
    for (const [modelId] of Object.entries(pricingModels)) {
      if (modelId.startsWith('_')) continue;
      if (!models.find(m => m.id === modelId)) {
        models.push({ id: modelId, object: 'model', created: 1700000000, owned_by: 'deepseek' });
      }
    }
    return reply.send({ object: 'list', data: models });
  };

  const handleMessages = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startTime = Date.now();

    const budgetCheck = shouldBlock();
    if (budgetCheck.block) {
      logger.logBudget(budgetCheck.state.daily.spent, budgetCheck.state.daily.limit, 'daily');
      logger.logBudget(budgetCheck.state.monthly.spent, budgetCheck.state.monthly.limit, 'monthly');
      return reply.status(429).send({ error: { type: 'budget_exceeded', message: budgetCheck.reason } });
    }
    if (budgetCheck.state.overall !== 'ok') {
      logBudgetStatus(budgetCheck.state);
      if (budgetCheck.state.daily.status !== 'ok') {
        eventBus.emitBudgetAlert({ period: 'daily', spent: budgetCheck.state.daily.spent, limit: budgetCheck.state.daily.limit, pct: budgetCheck.state.daily.pct, status: budgetCheck.state.daily.status });
      }
    }

    const apiKey = req.headers['x-api-key'] as string || '';
    const anthropicVersion = req.headers['anthropic-version'] as string || '2023-06-01';
    const sessionId = (req.headers['x-session-id'] as string) || uuidv4();

    const body = req.body as ProxyRequestBody;
    const originalModel = body?.model || 'unknown';
    const { remapped } = remapModel(originalModel);
    body.model = remapped;

    const bodyStr = JSON.stringify(body);
    const url = `${config.upstreamUrl}/v1/messages`;
    const upstreamHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': anthropicVersion,
      'Accept': 'application/json',
    };
    const beta = req.headers['anthropic-beta'] as string | undefined;
    if (beta) upstreamHeaders['anthropic-beta'] = beta;

    logger.log(`→ ${sessionId.slice(0, 8)}  ${originalModel} → ${remapped}`, 'info');
    eventBus.emitRequestStart({ sessionId, originalModel, remappedModel: remapped, timestamp: startTime });

    try {
      const upstreamResp = await fetch(url, { method: 'POST', headers: upstreamHeaders, body: bodyStr });

      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text();
        let errSummary: string;
        try { errSummary = JSON.parse(errorText)?.error?.message || errorText.slice(0, 200); }
        catch { errSummary = errorText.slice(0, 200); }
        logger.log(`Upstream ${upstreamResp.status}: ${errSummary}`, 'error');
        return reply.status(upstreamResp.status)
          .headers({ 'content-type': upstreamResp.headers.get('content-type') || 'application/json', 'x-session-id': sessionId })
          .send(errorText);
      }

      const isStreaming = body.stream === true;

      if (isStreaming) {
        return handleStreamingResponse(upstreamResp, reply, sessionId, startTime, originalModel);
      } else {
        return handleNonStreamingResponse(upstreamResp, reply, sessionId, startTime, originalModel);
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.log(`Proxy error: ${msg}`, 'error');
      return reply.status(502).send({ error: 'Bad Gateway', detail: msg });
    }
  };

  // ── Register routes (both prefixes) ─────────────────────────
  server.get('/v1/models', handleModelsList);
  server.get('/v1/v1/models', handleModelsList);
  server.post('/v1/messages', handleMessages);
  server.post('/v1/v1/messages', handleMessages);

  // ═══════════════════════════════════════════════════════════════
  // SPA FALLBACK — serve index.html for all other GET requests
  // ═══════════════════════════════════════════════════════════════

  server.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    if (req.method === 'GET' && !req.url.startsWith('/v1/') && !req.url.startsWith('/api/') && !req.url.startsWith('/ws') && !req.url.startsWith('/health') && !req.url.startsWith('/stats') && !req.url.startsWith('/debug/')) {
      const indexPath = join(__dirname, '..', 'web', 'dist', 'index.html');
      try {
        const html = readFileSync(indexPath, 'utf-8');
        return reply.type('text/html').send(html);
      } catch {
        return reply.status(404).send({ error: 'Not Found', message: 'Dashboard not built. Run: cd web && npm run build' });
      }
    }
    return reply.status(404).send({ error: 'Not Found' });
  });

  return server;
}

// ── Response handlers ───────────────────────────────────────────

async function handleStreamingResponse(
  upstreamResp: Response, reply: FastifyReply, sessionId: string, startTime: number, originalModel: string,
): Promise<void> {
  const interceptor = new SSEInterceptor();

  interceptor.on('usage', (metrics: UsageMetrics) => {
    const durationMs = Date.now() - startTime;
    recordRequest(sessionId, metrics, durationMs, originalModel, upstreamResp.status, true);
    const costBreakdown = calculateCost(metrics.model, metrics.inputTokens, metrics.outputTokens, metrics.cacheReadTokens, metrics.cacheWriteTokens);
    logger.logRequest(metrics, sessionId, durationMs, costBreakdown.cost);
    eventBus.emitRequestEnd({ sessionId, metrics, originalModel, durationMs, cost: costBreakdown.cost, timestamp: Date.now() });
  });

  reply.raw.writeHead(upstreamResp.status, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
    'x-session-id': sessionId,
  });

  if (upstreamResp.body) {
    const nodeReadable = Readable.fromWeb(upstreamResp.body as unknown as import('stream/web').ReadableStream);
    nodeReadable.pipe(interceptor).pipe(reply.raw);
  } else {
    reply.raw.end();
  }
}

async function handleNonStreamingResponse(
  upstreamResp: Response, reply: FastifyReply, sessionId: string, startTime: number, originalModel: string,
): Promise<void> {
  const bodyText = await upstreamResp.text();
  let parsed: any;
  try { parsed = JSON.parse(bodyText); } catch {
    return reply.status(upstreamResp.status)
      .headers({ 'content-type': upstreamResp.headers.get('content-type') || 'application/json', 'x-session-id': sessionId })
      .send(bodyText);
  }

  const usage = parsed.usage;
  if (usage) {
    const model: string = parsed.model || 'unknown';
    const inputTokens: number = usage.input_tokens || 0;
    const outputTokens: number = usage.output_tokens || 0;
    const cacheReadTokens: number = usage.cache_read_input_tokens || 0;
    const cacheWriteTokens: number = usage.cache_creation_input_tokens || 0;
    const durationMs = Date.now() - startTime;

    const metrics: UsageMetrics = { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, events: [] };
    recordRequest(sessionId, metrics, durationMs, originalModel, upstreamResp.status, false);
    const costBreakdown = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
    logger.logRequest(metrics, sessionId, durationMs, costBreakdown.cost);
    eventBus.emitRequestEnd({ sessionId, metrics, originalModel, durationMs, cost: costBreakdown.cost, timestamp: Date.now() });
  }

  return reply.status(upstreamResp.status)
    .headers({ 'content-type': upstreamResp.headers.get('content-type') || 'application/json', 'x-session-id': sessionId })
    .send(parsed);
}
