import React, { createContext, useContext, useState, useCallback } from 'react';
const ToastCtx = createContext<{ show: (msg: string, t?: 'ok'|'error'|'info') => void }>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: string }>>([]);
  const show = useCallback((msg: string, type = 'ok') => { const id = Date.now(); setToasts(p => [...p.slice(-3), { id, message: msg, type }]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000); }, []);
  return <ToastCtx.Provider value={{ show }}>{children}<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">{toasts.map(t => <div key={t.id} className={`px-4 py-2 rounded-lg text-sm font-mono shadow-lg border ${t.type==='ok'?'bg-emerald-900/90 border-emerald-600/40 text-emerald-200':t.type==='error'?'bg-red-900/90 border-red-600/40 text-red-200':'bg-zinc-800/95 border-zinc-600/40 text-zinc-200'}`} style={{animation:'slideIn .3s ease-out'}}>{t.type==='ok'?'✓ ':t.type==='error'?'✖ ':'ℹ '}{t.message}</div>)}</div><style>{'@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}'}</style></ToastCtx.Provider>;
}
