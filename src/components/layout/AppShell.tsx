import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ChevronDown, LogOut, Menu, Moon, ShieldHalf, Sun, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/components/ui/primitives';
import { AVAILABLE_ROUTES, NAV_SECTIONS } from './navigation';
import { useTheme } from '@/hooks/useTheme';

const ENV = (import.meta.env.VITE_APP_ENV as string | undefined) || 'local';
const ENV_STYLES: Record<string, string> = {
  production: 'bg-red-500/15 text-red-300 ring-red-500/30',
  staging: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  local: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
};

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  return (
    <nav className="flex h-full flex-col bg-nav text-slate-300" aria-label="Main">
      <div className="flex h-14 items-center gap-2 border-b border-nav-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-accent-500/15 text-accent-300 ring-1 ring-accent-400/30">
          <ShieldHalf className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-white">Imara</p>
          <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">Platform Admin</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(
            (i) => AVAILABLE_ROUTES.has(i.to) && (i.permissions.length === 0 || canAny(...i.permissions)),
          );
          if (!items.length) return null;
          return (
            <div key={section.title}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{section.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.to === '/'} onClick={onNavigate} className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}>
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-nav-border px-4 py-3 text-[11px] text-slate-500">SmartTech internal use only</div>
    </nav>
  );
}

export function AppShell() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-60">
          <Sidebar />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
          <button className="absolute top-3 left-[17rem] rounded-md bg-white/10 p-1.5 text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <button className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset', ENV_STYLES[ENV] ?? ENV_STYLES.local, 'bg-nav')}>
            SmartTech Platform Admin · {ENV}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggle} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold text-white">
                  {admin?.firstName?.[0]}
                  {admin?.lastName?.[0]}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[13px] font-medium">
                    {admin?.firstName} {admin?.lastName}
                  </span>
                  <span className="block text-[11px] text-zinc-500">{admin?.roles.map((r) => r.name).join(', ')}</span>
                </span>
                <ChevronDown className="size-3.5 text-zinc-400" />
              </button>
              {menuOpen && (
                <div className="card absolute right-0 mt-1 w-52 p-1 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                  <button className="block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => { setMenuOpen(false); navigate('/account'); }}>
                    My account & security
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={async () => {
                      await logout();
                      navigate('/login');
                    }}
                  >
                    <LogOut className="size-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
