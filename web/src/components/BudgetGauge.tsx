import React from 'react';

interface Props {
  daily: { spent: number; limit: number; pct: number; status: string };
  monthly: { spent: number; limit: number; pct: number; status: string };
}

function Gauge({ spent, limit, pct, status, label }: { spent: number; limit: number; pct: number; status: string; label: string }) {
  const color = status === 'exceeded' ? '#ef4444' : status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#22c55e';
  const circumference = 2 * Math.PI * 38;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" fill="none" stroke="#27272a" strokeWidth="8" />
        <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x="50" y="46" textAnchor="middle" fill="#e4e4e7" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
          {pct.toFixed(1)}%
        </text>
        <text x="50" y="62" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="JetBrains Mono, monospace">
          {label}
        </text>
      </svg>
      <div className="text-xs text-zinc-500 font-mono mt-1">
        ${spent.toFixed(3)} / ${limit.toFixed(0)}
      </div>
    </div>
  );
}

export default function BudgetGauge({ daily, monthly }: Props) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm text-zinc-400 mb-4">💰 Budget</h3>
      <div className="flex justify-around">
        <Gauge {...daily} label="Day" />
        <Gauge {...monthly} label="Month" />
      </div>
    </div>
  );
}
