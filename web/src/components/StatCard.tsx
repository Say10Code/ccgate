import React, { useEffect, useRef, useState } from 'react';

interface Props { label: string; value: string; rawValue?: number; icon: string; color: string }

const bc: Record<string,string> = { green:'border-green-500/30 bg-green-500/5', cyan:'border-cyan-500/30 bg-cyan-500/5', yellow:'border-yellow-500/30 bg-yellow-500/5', purple:'border-purple-500/30 bg-purple-500/5', zinc:'border-zinc-500/30 bg-zinc-500/5' };
const tc: Record<string,string> = { green:'text-green-400', cyan:'text-cyan-400', yellow:'text-yellow-400', purple:'text-purple-400', zinc:'text-zinc-400' };

function useAnimatedValue(target: number, dur = 600) {
  const [d, setD] = useState(target); const prev = useRef(target);
  useEffect(() => { if (prev.current === target) return; prev.current = target; const sv = d; const diff = target - sv; const s = performance.now();
    function tick(n: number) { const e = n - s; const p = Math.min(1, e / dur); const ea = 1 - Math.pow(1 - p, 3); setD(sv + diff * ea); if (p < 1) requestAnimationFrame(tick); }
    requestAnimationFrame(tick); }, [target]);
  return d;
}

export default function StatCard({ label, value, rawValue, icon, color }: Props) {
  const dn = rawValue !== undefined ? useAnimatedValue(rawValue) : null;
  return <div className={`border rounded-lg p-4 transition-all duration-300 ${bc[color]||bc.zinc} hover:scale-[1.02]`}>
    <div className="flex items-center justify-between mb-2"><span className="text-sm text-zinc-500">{label}</span><span className="text-lg">{icon}</span></div>
    <div className={`text-2xl font-bold font-mono ${tc[color]||tc.zinc} transition-colors`}>
      {dn !== null ? (dn >= 1e6 ? (dn/1e6).toFixed(1)+'M' : dn >= 1000 ? (dn/1000).toFixed(1)+'K' : String(Math.round(dn))) : value}
    </div>
  </div>;
}
