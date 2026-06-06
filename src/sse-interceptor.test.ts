import { describe, it, expect } from 'vitest';
import { SSEInterceptor } from './sse-interceptor.js';

/**
 * Helper: create Anthropic-format SSE events as a Buffer
 */
function makeSseChunk(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n') + '\n', 'utf-8');
}

/**
 * Helper: collect all output and parse the final usage event
 */
function collectOutput(interceptor: SSEInterceptor): Promise<{ output: string; usage: any }> {
  return new Promise((resolve) => {
    let output = '';
    interceptor.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    });
    interceptor.on('usage', (usage: any) => {
      resolve({ output, usage });
    });
    interceptor.on('error', () => {
      resolve({ output, usage: null });
    });
  });
}

describe('SSEInterceptor', () => {
  it('passes through chunks immediately (zero latency)', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    // Write a partial event
    interceptor.write(makeSseChunk(['event: message_start']));
    interceptor.write(makeSseChunk(['data: {"type":"message_start","message":{"id":"msg_1","model":"deepseek-v4-flash","usage":{"input_tokens":100}}}']));
    interceptor.write(makeSseChunk([''])); // empty line = end event
    interceptor.write(makeSseChunk(['event: message_stop', 'data: {"type":"message_stop"}']));
    interceptor.end();

    const { output, usage } = await resultPromise;

    // Output should contain all the SSE events (passthrough worked)
    expect(output).toContain('event: message_start');
    expect(output).toContain('event: message_stop');
    expect(output).toContain('deepseek-v4-flash');

    // Usage should be extracted
    expect(usage).toBeDefined();
    expect(usage.model).toBe('deepseek-v4-flash');
    expect(usage.inputTokens).toBe(100);
  });

  it('extracts input tokens from message_start', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    interceptor.write(Buffer.from(
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"abc","model":"deepseek-v4-pro","usage":{"input_tokens":2500,"cache_read_input_tokens":300,"cache_creation_input_tokens":100}}}\n' +
      '\n',
      'utf-8',
    ));
    interceptor.end();

    const { usage } = await resultPromise;
    expect(usage.model).toBe('deepseek-v4-pro');
    expect(usage.inputTokens).toBe(2500);
    expect(usage.cacheReadTokens).toBe(300);
    expect(usage.cacheWriteTokens).toBe(100);
  });

  it('extracts output tokens from message_delta', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    interceptor.write(Buffer.from(
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"1","model":"deepseek-v4-flash","usage":{"input_tokens":10}}}\n' +
      '\n' +
      'event: message_delta\n' +
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}\n' +
      '\n' +
      'event: message_stop\n' +
      'data: {"type":"message_stop"}\n' +
      '\n',
      'utf-8',
    ));
    interceptor.end();

    const { usage } = await resultPromise;
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(42);
  });

  it('handles chunked SSE (split across multiple writes)', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    // Simulate network chunking: split mid-line
    interceptor.write(Buffer.from('event: message_star', 'utf-8'));
    interceptor.write(Buffer.from('t\n', 'utf-8'));
    interceptor.write(Buffer.from('data: {"type":"message_start","mess', 'utf-8'));
    interceptor.write(Buffer.from('age":{"id":"X","model":"deepseek-r1","usage":{"input_tokens":5000}}', 'utf-8'));
    interceptor.write(Buffer.from('}\n', 'utf-8'));
    interceptor.write(Buffer.from('\n', 'utf-8'));
    interceptor.end();

    const { usage } = await resultPromise;
    expect(usage.model).toBe('deepseek-r1');
    expect(usage.inputTokens).toBe(5000);
  });

  it('accumulates events in order', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"1","model":"m1","usage":{"input_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];

    for (const e of events) {
      interceptor.write(Buffer.from(e, 'utf-8'));
    }
    interceptor.end();

    const { usage } = await resultPromise;
    expect(usage.events).toHaveLength(5);
    expect(usage.events[0].type).toBe('message_start');
    expect(usage.events[4].type).toBe('message_stop');
  });

  it('survives malformed JSON gracefully', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    interceptor.write(Buffer.from('event: message_start\ndata: {not valid json\n\n', 'utf-8'));
    interceptor.write(Buffer.from('event: message_stop\ndata: {"type":"message_stop"}\n\n', 'utf-8'));
    interceptor.end();

    const { usage } = await resultPromise;
    // Should not crash; usage will be 0 because the malformed event was skipped
    expect(usage).toBeDefined();
    expect(usage.inputTokens).toBe(0);
  });

  it('handles ping events correctly', async () => {
    const interceptor = new SSEInterceptor();
    const resultPromise = collectOutput(interceptor);

    interceptor.write(Buffer.from('event: ping\ndata: {}\n\n', 'utf-8'));
    interceptor.write(Buffer.from(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"p1","model":"deepseek-v4-flash","usage":{"input_tokens":50}}}\n\n',
      'utf-8',
    ));
    interceptor.end();

    const { usage } = await resultPromise;
    expect(usage.events).toHaveLength(2);
    expect(usage.events[0].type).toBe('ping');
    expect(usage.events[1].type).toBe('message_start');
  });
});
