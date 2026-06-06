import React from 'react';

interface Props {
  label: string;
  value: string;
  icon: string;
  color: string;
}

const colors: Record<string, string> = {
  green: 'border-green-500/30 bg-green-500/5',
  cyan: 'border-cyan-500/30 bg-cyan-500/5',
  yellow: 'border-yellow-500/30 bg-yellow-500/5',
  purple: 'border-purple-500/30 bg-purple-500/5',
  zinc: 'border-zinc-500/30 bg-zinc-500/5',
};

const textColors: Record<string, string> = {
  green: 'text-green-400',
  cyan: 'text-cyan-400',
  yellow: 'text-yellow-400',
  purple: 'text-purple-400',
  zinc: 'text-zinc-400',
};

export default function StatCard({ label, value, icon, color }: Props) {
  return (
    <div className={`border rounded-lg p-4 ${colors[color] || colors.zinc}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-zinc-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${textColors[color] || textColors.zinc}`}>
        {value}
      </div>
    </div>
  );
}
