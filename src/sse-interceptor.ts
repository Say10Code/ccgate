import { Transform, TransformCallback } from 'stream';

/**
 * Parsed usage data extracted from SSE events
 */
export interface UsageMetrics {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Raw SSE events collected during streaming */
  events: SseEvent[];
}

/**
 * A single parsed SSE event
 */
export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  raw: string;
}

/**
 * SSEInterceptor — a Node.js Transform stream that achieves zero-latency
 * passthrough while accumulating SSE event data.
 *
 * Every chunk is forwarded immediately to the client. In parallel, the
 * interceptor buffers lines and parses complete SSE events to extract
 * token usage. When the stream ends, it emits a 'usage' event with the
 * accumulated metrics.
 */
export class SSEInterceptor extends Transform {
  private lineBuffer = '';
  private eventType = '';
  private eventData = '';
  private metrics: UsageMetrics = {
    model: 'unknown',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    events: [],
  };

  constructor() {
    super();
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    // 1. Passthrough immediately — ZERO LATENCY
    this.push(chunk);

    // 2. Accumulate lines and parse SSE events
    try {
      this.lineBuffer += chunk.toString('utf-8');
      this.processBuffer();
    } catch {
      // Never let parse errors break the proxy
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    // Process any remaining data in the buffer
    try {
      if (this.lineBuffer.trim()) {
        this.lineBuffer += '\n';
        this.processBuffer();
      }
    } catch {
      // Ignore flush errors
    }

    this.emit('usage', { ...this.metrics });
    callback();
  }

  /**
   * Get the current accumulated metrics (for live preview)
   */
  getMetrics(): Readonly<UsageMetrics> {
    return { ...this.metrics };
  }

  // ── Private ──────────────────────────────────────────────

  private processBuffer(): void {
    const lines = this.lineBuffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        this.eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        this.eventData += line.slice(6);
      } else if (line === '' || line === '\r') {
        // Empty line = end of one SSE event
        if (this.eventData) {
          this.handleCompleteEvent();
        }
        this.eventType = '';
        this.eventData = '';
      }
    }
  }

  private handleCompleteEvent(): void {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(this.eventData);
    } catch {
      // Malformed JSON — skip event
      return;
    }

    if (!parsed) return;

    const event: SseEvent = {
      type: this.eventType || (parsed.type as string) || 'unknown',
      data: parsed,
      raw: this.eventData,
    };
    this.metrics.events.push(event);

    switch (event.type) {
      case 'message_start': {
        const msg = parsed.message as Record<string, unknown> | undefined;
        if (msg) {
          const model = msg.model as string | undefined;
          if (model) this.metrics.model = model;

          const usage = msg.usage as Record<string, number> | undefined;
          if (usage) {
            const rawInput = usage.input_tokens || 0;
            const rawCacheRead = usage.cache_read_input_tokens || 0;
            // ⚠ Defense: DeepSeek sometimes reports cache_read > input_tokens
            // which makes cost negative. Clamp to physically possible range.
            this.metrics.inputTokens = rawInput;
            this.metrics.cacheReadTokens = Math.min(rawCacheRead, rawInput);
            this.metrics.cacheWriteTokens = usage.cache_creation_input_tokens || 0;
          }
        }
        break;
      }
      case 'message_delta': {
        // Extract output token count
        const usage = parsed.usage as Record<string, number> | undefined;
        if (usage) {
          this.metrics.outputTokens = usage.output_tokens || 0;
        }
        break;
      }
    }
  }
}
