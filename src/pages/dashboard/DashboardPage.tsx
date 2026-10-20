import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Building2, CheckCircle2, PauseCircle, Sparkles } from 'lucide-react';
import { reportsApi } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { Card, PageHeader, cn } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/States';
import { DistributionChart } from '@/components/charts/Charts';
import { formatDateTime, formatMoney } from '@/lib/format';

function Widget({ to, label, value, sub, icon, tone = 'accent' }: { to: string; label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: 'accent' | 'danger' | 'warning' | 'info' }) {
  const tones = {
    accent: 'bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300',
    danger: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  };
  return (
    <Link to={to} className="card group block p-4 transition-shadow hover:shadow-md focus-visible:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <span className={cn('rounded-md p-1.5', tones[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      <p className="mt-2 text-[11px] font-medium text-accent-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-accent-300">View details →</p>
    </Link>
  );
}

/** Overview Dashboard (PRD Admin Module 1): read-only snapshot; every widget links to its module. */
export function DashboardPage() {
  const { admin, can } = useAuth();
  const overview = useQuery({ queryKey: ['overview'], queryFn: reportsApi.overview, refetchInterval: 60_000, enabled: can('dashboard.view') });
  if (!can('dashboard.view')) {
    return <PageHeader title={`Welcome, ${admin?.firstName}`} description="Your role does not include the overview dashboard." />;
  }
  return (
    <div>
      <PageHeader title="Overview" description="Is everything okay right now, and what needs attention today?" actions={overview.data && <span className="text-xs text-zinc-500">Updated {formatDateTime(overview.data.generatedAt)}</span>} />
      <QueryState query={overview}>
        {(o) => (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Widget to="/tenants" label="Total clients" value={o.totalClients.toLocaleString()} sub={`${o.archivedClients} archived`} icon={<Building2 className="size-4" />} />
              <Widget to="/tenants?status=ACTIVE,TRIAL,GRACE_PERIOD" label="Active clients" value={o.activeClients.toLocaleString()} sub="Including clients on a free trial" icon={<CheckCircle2 className="size-4" />} />
              <Widget to={`/tenants?provisionedFrom=${new Date().toISOString().slice(0, 8)}01`} label="New clients this month" value={o.newClientsThisMonth.toLocaleString()} sub="Provisioned since the 1st" icon={<Sparkles className="size-4" />} tone="info" />
              <Widget to="/reports" label="Monthly revenue" value={formatMoney(o.monthlyRevenue)} sub="Payments received this calendar month" icon={<Banknote className="size-4" />} />
              <Widget to="/billing/invoices?status=OVERDUE" label="Overdue invoices" value={o.overdueInvoices.count.toLocaleString()} sub={`${formatMoney(o.overdueInvoices.value)} outstanding`} icon={<AlertTriangle className="size-4" />} tone={o.overdueInvoices.count ? 'danger' : 'accent'} />
              <Widget to="/tenants?status=SUSPENDED" label="Suspended clients" value={o.suspendedClients.toLocaleString()} sub="Access blocked" icon={<PauseCircle className="size-4" />} tone={o.suspendedClients ? 'warning' : 'accent'} />
            </div>
            {can('billing.view') && (
              <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
                <Card title="Billing at a glance" actions={<Link to="/reports" className="text-xs text-accent-700 hover:underline dark:text-accent-300">Revenue reports →</Link>}>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[
                      ['Monthly revenue (MR)', formatMoney(o.billing.monthlyRevenue), '/reports'],
                      ['Active subscriptions', o.billing.activeSubscriptions, '/billing/subscriptions?status=ACTIVE'],
                      ['Past-due subscriptions', o.billing.pastDueSubscriptions, '/billing/subscriptions?status=PAST_DUE'],
                      ['Payments (30 days)', o.billing.recentPayments, '/billing/payments'],
                      ['Failed payments (30 days)', o.billing.recentFailures, '/reports?tab=failed'],
                    ].map(([label, value, to]) => (
                      <Link key={label as string} to={to as string} className="rounded-md p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <dt className="text-xs text-zinc-500">{label}</dt>
                        <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
                      </Link>
                    ))}
                  </dl>
                </Card>
                <Card title="Plan distribution">
                  <DistributionChart data={o.billing.planDistribution.map((p) => ({ label: p.planName, value: p.clients }))} />
                </Card>
              </div>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
