import React, { useEffect, useState } from 'react';

interface Props {
  connected: boolean;
  uptime: string;
}

export default function Navbar({ connected, uptime }: Props) {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-white font-mono">
          <span className="text-cyan-400">cc</span><span className="text-zinc-300">gate</span>
          <span className="text-zinc-600 text-sm ml-2">v0.3.0</span>
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-zinc-400">{connected ? 'Live' : 'Polling'}</span>
        </div>
      </div>
      <div className="flex items-center gap-6 text-sm text-zinc-500 font-mono">
        <span>⏱ {uptime}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}
