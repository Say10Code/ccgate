import React, { useRef, useEffect } from 'react';
interface Props { data: Array<{ hour: string; cost: number; requests: number }> }
export default function CostChart({ data }: Props) {
  const cRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const pad = { t:10, r:10, b:25, l:50 }, pw = W-pad.l-pad.r, ph = H-pad.t-pad.b;
    ctx.fillStyle='#09090b'; ctx.fillRect(0,0,W,H);
    if (data.length < 2) { ctx.fillStyle='#52525b'; ctx.font='11px JetBrains Mono,monospace'; ctx.textAlign='center'; ctx.fillText('No data yet',W/2,H/2); return; }
    const costs = data.map(d=>d.cost), maxC = Math.max(...costs,0.0001);
    ctx.strokeStyle='#27272a'; ctx.lineWidth=0.5;
    for(let i=0;i<=4;i++){ const y=pad.t+(ph/4)*i; ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke(); ctx.fillStyle='#71717a'; ctx.font='9px JetBrains Mono,monospace'; ctx.textAlign='right'; ctx.fillText('$'+((maxC/4)*(4-i)).toFixed(4),pad.l-5,y+3); }
    const step = Math.max(1,Math.floor(data.length/6));
    data.forEach((d,i)=>{ if(i%step!==0&&i!==data.length-1)return; const x=pad.l+(pw/(data.length-1))*i; ctx.fillStyle='#71717a'; ctx.font='9px JetBrains Mono,monospace'; ctx.textAlign='center'; ctx.fillText((d.hour||'').slice(11,16)||'',x,H-pad.b+14); });
    const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+ph); grad.addColorStop(0,'rgba(34,211,238,0.25)'); grad.addColorStop(1,'rgba(34,211,238,0)');
    ctx.beginPath(); ctx.moveTo(pad.l,pad.t+ph); data.forEach((d,i)=>{ const x=pad.l+(pw/(data.length-1))*i; const y=pad.t+ph-((d.cost)/(maxC))*ph; ctx.lineTo(x,y); }); ctx.lineTo(pad.l+pw,pad.t+ph); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
    ctx.beginPath(); ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2; ctx.lineJoin='round'; data.forEach((d,i)=>{ const x=pad.l+(pw/(data.length-1))*i; const y=pad.t+ph-((d.cost)/(maxC))*ph; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }); ctx.stroke();
    const last=data[data.length-1]; ctx.beginPath(); ctx.arc(pad.l+pw, pad.t+ph-(last.cost/maxC)*ph, 3, 0, Math.PI*2); ctx.fillStyle='#22d3ee'; ctx.fill();
  }, [data]);
  return <div className="border border-zinc-800 rounded-lg p-4"><h3 className="text-sm text-zinc-400 mb-2">📈 Cost History (24h)</h3><div className="relative w-full" style={{height:180}}><canvas ref={cRef} className="w-full h-full" /></div></div>;
}
