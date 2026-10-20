import type { ReactNode } from 'react';
import { ShieldHalf } from 'lucide-react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-nav px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.15),transparent_60%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-300 ring-1 ring-accent-400/30">
            <ShieldHalf className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold">Imara Platform Admin</p>
            <p className="text-[11px] tracking-wider text-slate-400 uppercase">SmartTech staff only</p>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-white p-6 shadow-2xl dark:bg-zinc-900">
          <h1 className="text-base font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-zinc-500">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">All access is logged. Unauthorised use is prohibited.</p>
      </div>
    </div>
  );
}
