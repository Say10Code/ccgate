import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: Array<{ hour: string; cost: number; requests: number }>;
}

export default function CostChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm text-zinc-400 mb-2">📈 Cost History (24h)</h3>
        <div className="text-zinc-600 text-sm py-8 text-center">No data yet</div>
      </div>
    );
  }

  const formatted = data.map(d => ({
    ...d,
    label: d.hour.slice(11, 16), // extract HH:MM
    cost: Math.round(d.cost * 100000) / 100000,
  }));

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm text-zinc-400 mb-2">📈 Cost History (24h)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} />
          <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={v => `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '12px' }}
            formatter={(v: number, name: string) => [name === 'cost' ? `$${v.toFixed(6)}` : v, name === 'cost' ? 'Cost' : 'Requests']}
            labelFormatter={l => `Hour: ${l}`}
          />
          <Area type="monotone" dataKey="cost" stroke="#22d3ee" fill="url(#costGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
