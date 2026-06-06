interface QueueItem { id: string; run: () => Promise<Response>; resolve: (r: Response) => void; reject: (e: Error) => void; enqueuedAt: number; }
let active = 0; const queue: QueueItem[] = []; let maxConcurrency = 5; let timeoutMs = 30_000;
export function configureQueue(o: { concurrency?: number; timeout?: number }): void { if (o.concurrency) maxConcurrency = o.concurrency; if (o.timeout) timeoutMs = o.timeout; }
export function queueRequest(id: string, run: () => Promise<Response>): Promise<Response> { return new Promise((resolve, reject) => { queue.push({ id, run, resolve, reject, enqueuedAt: Date.now() }); drain(); }); }
export function getQueueStats() { return { active, queued: queue.length, maxConcurrency }; }
function drain(): void { const now = Date.now(); while (queue.length > 0 && now - queue[0].enqueuedAt > timeoutMs) { const item = queue.shift()!; item.reject(new Error(`Timeout after ${timeoutMs}ms`)); } while (active < maxConcurrency && queue.length > 0) { const item = queue.shift()!; active++; item.run().then(r => item.resolve(r)).catch(e => item.reject(e)).finally(() => { active--; drain(); }); } }
