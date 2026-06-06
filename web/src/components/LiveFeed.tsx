import React, { useEffect, useRef, useState } from 'react';

interface FeedEntry {
  id: number;
  text: string;
  type: 'info' | 'ok' | 'error' | 'warn';
}

let feedId = 0;

export default function LiveFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const entry: FeedEntry = { id: feedId++, text: '', type: 'info' };

        if (msg.type === 'request:start') {
          entry.text = `→ ${msg.sessionId?.slice(0, 6)}  ${msg.originalModel} → ${msg.remappedModel}`;
          entry.type = 'info';
        } else if (msg.type === 'request:end') {
          const toks = `${msg.metrics?.inputTokens}→${msg.metrics?.outputTokens}`;
          entry.text = `✓ ${msg.sessionId?.slice(0, 6)}  $${msg.cost?.toFixed(6)}  ${toks} tok  ${msg.durationMs}ms`;
          entry.type = 'ok';
        } else if (msg.type === 'budget:alert') {
          entry.text = `⚠ Budget ${msg.period}: $${msg.spent?.toFixed(2)}/$${msg.limit?.toFixed(2)} (${msg.pct?.toFixed(1)}%)`;
          entry.type = 'warn';
        } else if (msg.type === 'stats:update') {
          return; // stats handled by parent
        } else {
          return;
        }

        setEntries(prev => [...prev.slice(-99), entry]);
      } catch {}
    };

    ws.onclose = () => {
      setEntries(prev => [...prev.slice(-99), { id: feedId++, text: 'WebSocket disconnected — polling fallback', type: 'warn' }]);
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const colors: Record<string, string> = {
    info: 'text-cyan-400',
    ok: 'text-green-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm text-zinc-400 mb-2">📡 Live Feed</h3>
      <div className="h-48 overflow-y-auto font-mono text-xs space-y-1">
        {entries.length === 0 && (
          <div className="text-zinc-600">Waiting for events...</div>
        )}
        {entries.map(e => (
          <div key={e.id} className={colors[e.type]}>
            {e.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
