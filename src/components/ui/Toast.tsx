import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<{ push: (tone: ToastTone, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, tone, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="card pointer-events-auto flex items-start gap-2 px-3 py-2.5 shadow-lg">
            {t.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
            ) : t.tone === 'error' ? (
              <XCircle className="mt-0.5 size-4 text-red-600" />
            ) : (
              <Info className="mt-0.5 size-4 text-sky-600" />
            )}
            <p className="flex-1 text-[13px]">{t.message}</p>
            <button onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-zinc-400 hover:text-zinc-700">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return {
    success: (m: string) => ctx.push('success', m),
    error: (e: unknown) => ctx.push('error', e instanceof Error ? e.message : String(e)),
    info: (m: string) => ctx.push('info', m),
  };
}
