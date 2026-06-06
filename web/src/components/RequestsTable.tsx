import React, { useEffect, useState } from 'react';
import { fetchRequests, type RequestRecord } from '../api';

export default function RequestsTable() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchRequests(20);
        setRequests(data.requests || []);
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm text-zinc-400 mb-2">📋 Recent Requests</h3>
        <div className="text-zinc-600 text-sm py-4">Loading...</div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm text-zinc-400 mb-2">📋 Recent Requests</h3>
        <div className="text-zinc-600 text-sm py-4">No requests yet</div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm text-zinc-400 mb-2">📋 Recent Requests</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-1 pr-3 font-normal">Time</th>
              <th className="text-left py-1 pr-3 font-normal">Session</th>
              <th className="text-left py-1 pr-3 font-normal">Model</th>
              <th className="text-right py-1 pr-3 font-normal">Tokens</th>
              <th className="text-right py-1 pr-3 font-normal">Cost</th>
              <th className="text-right py-1 font-normal">Duration</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="border-b border-zinc-800/50 text-xs font-mono">
                <td className="py-1 pr-3 text-zinc-500">
                  {r.created_at ? new Date(r.created_at + 'Z').toLocaleTimeString('en-US', { hour12: false }) : '—'}
                </td>
                <td className="py-1 pr-3 text-cyan-400">{r.session_id?.slice(0, 6)}</td>
                <td className="py-1 pr-3 text-zinc-300 max-w-[120px] truncate">{r.model}</td>
                <td className="py-1 pr-3 text-right text-zinc-300">
                  {r.input_tokens}→{r.output_tokens}
                </td>
                <td className="py-1 pr-3 text-right text-green-400">
                  ${r.cost.toFixed(6)}
                </td>
                <td className="py-1 text-right text-zinc-500">
                  {(r.duration_ms / 1000).toFixed(1)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
