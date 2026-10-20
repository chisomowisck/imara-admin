import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Button, Card, Input, PageHeader, StatusBadge, Tabs } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { DistributionChart, RevenueChart } from '@/components/charts/Charts';
import { formatDate, formatDateTime, formatMoney, humanize } from '@/lib/format';

type Tab = 'revenue' | 'plans' | 'payments' | 'failed' | 'churn';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { admin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'revenue';
  const [months, setMonths] = useState(12);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const range = { from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() };

  const revenue = useQuery({ queryKey: ['rev', months], queryFn: () => reportsApi.revenue(months), enabled: tab === 'revenue' });
  const dist = useQuery({ queryKey: ['dist'], queryFn: reportsApi.distribution, enabled: tab === 'plans' });
  const byPlan = useQuery({ queryKey: ['by-plan'], queryFn: reportsApi.byPlan, enabled: tab === 'plans' });
  const payments = useQuery({ queryKey: ['rep-pay', page, from, to], queryFn: () => reportsApi.payments({ page, limit: 25, ...range }), enabled: tab === 'payments' });
  const failed = useQuery({ queryKey: ['rep-failed', page, from, to], queryFn: () => reportsApi.failed({ page, limit: 25, ...range }), enabled: tab === 'failed' });
  const churn = useQuery({ queryKey: ['rep-churn', from, to], queryFn: () => reportsApi.churn(range), enabled: tab === 'churn' });

  const dateRange = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      From <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-36" /> to <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-36" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Revenue reports" description="Revenue, subscriptions and churn. Amounts in MWK." />
      <Tabs<Tab> value={tab} onChange={(t) => { setParams({ tab: t }, { replace: true }); setPage(1); }} tabs={[
        { id: 'revenue', label: 'Revenue' },
        { id: 'plans', label: 'Subscriptions by plan' },
        { id: 'payments', label: 'Payment history' },
        { id: 'failed', label: 'Failed payments' },
        { id: 'churn', label: 'Churn' },
      ]} />

      {tab === 'revenue' && (
        <QueryState query={revenue}>
          {(r) => (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Monthly revenue (MR)" value={formatMoney(r.monthlyRevenue)} hint="Received this calendar month" />
                <Kpi label="Annual revenue (AR)" value={formatMoney(r.annualRevenue)} hint="PRD definition: MR × 12" />
                <Kpi label="Year to date" value={formatMoney(r.yearToDate)} hint="Actually received since 1 January" />
                <Kpi label="Recurring run-rate" value={formatMoney(r.monthlyRecurringRunRate)} hint="Monthly value of live paid subscriptions" />
              </div>
              <Card title="Revenue by month" actions={<select className="input h-7 w-28 text-xs" value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}</select>}>
                <RevenueChart series={r.series} />
              </Card>
            </div>
          )}
        </QueryState>
      )}

      {tab === 'plans' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Plan distribution (clients per plan)"><QueryState query={dist}>{(d) => <DistributionChart data={d.map((x) => ({ label: x.planName, value: x.clients }))} />}</QueryState></Card>
          <Card title="Active subscriptions by plan" padded={false}>
            <DataTable rows={byPlan.data} loading={byPlan.isLoading} error={byPlan.error} rowKey={(r) => `${r.plan}-${r.billingCycle}-${r.status}`} exportConfig={{ fileBase: 'subscriptions-by-plan', title: 'Active subscriptions by plan', generatedBy: admin?.email }}
              columns={[
                { id: 'plan', header: 'Plan', cell: (r) => r.plan, value: (r) => r.plan, sortable: true },
                { id: 'cycle', header: 'Cycle', cell: (r) => humanize(r.billingCycle), value: (r) => r.billingCycle },
                { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
                { id: 'count', header: 'Subscriptions', cell: (r) => r.count, value: (r) => r.count, sortable: true },
              ]} />
          </Card>
        </div>
      )}

      {tab === 'payments' && (
        <DataTable
          rows={payments.data?.data}
          loading={payments.isLoading}
          error={payments.error}
          onRetry={payments.refetch}
          rowKey={(r) => r.id}
          pagination={payments.data?.meta}
          onPageChange={setPage}
          filters={dateRange}
          toolbar={(['xlsx', 'pdf', 'csv'] as const).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => reportsApi.exportPayments({ ...range, format: f }).catch(toast.error)}>{f === 'xlsx' ? 'Excel' : f.toUpperCase()}</Button>)}
          columns={[
            { id: 'paid', header: 'Paid at', cell: (r) => formatDateTime(r.paidAt), value: (r) => r.paidAt, sortable: true },
            { id: 'org', header: 'Organisation', cell: (r) => r.organization?.name ?? '—', value: (r) => r.organization?.name, sortable: true },
            { id: 'inv', header: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.invoice?.number ?? '—'}</span> },
            { id: 'method', header: 'Method', cell: (r) => humanize(r.method), value: (r) => r.method },
            { id: 'amount', header: 'Amount', cell: (r) => formatMoney(r.amount), value: (r) => r.amount, sortable: true, className: 'text-right' },
          ]}
          emptyTitle="No payments in this period"
        />
      )}
      {tab === 'payments' && payments.data && <p className="mt-2 text-xs text-zinc-500">Total in period: {formatMoney(payments.data.meta.sum)}</p>}

      {tab === 'failed' && (
        <DataTable
          rows={failed.data?.data}
          loading={failed.isLoading}
          error={failed.error}
          onRetry={failed.refetch}
          rowKey={(r) => r.id}
          pagination={failed.data?.meta}
          onPageChange={setPage}
          filters={dateRange}
          exportConfig={{ fileBase: 'failed-payments', title: 'Failed payments', generatedBy: admin?.email }}
          columns={[
            { id: 'at', header: 'Attempted', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt, sortable: true },
            { id: 'org', header: 'Organisation', cell: (r) => r.invoice?.billToName, value: (r) => r.invoice?.billToName },
            { id: 'inv', header: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.invoice?.number}</span>, value: (r) => r.invoice?.number },
            { id: 'reason', header: 'Failure reason', cell: (r) => r.failureReason ?? '—', value: (r) => r.failureReason },
            { id: 'amount', header: 'Amount', cell: (r) => formatMoney(r.amount), value: (r) => r.amount },
            { id: 'now', header: 'Current status', cell: (r) => <StatusBadge status={r.currentStatus} />, value: (r) => r.currentStatus },
          ]}
          emptyTitle="No failed payments in this period"
        />
      )}

      {tab === 'churn' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">{dateRange}</div>
          <QueryState query={churn}>
            {(c) => (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi label="Churned clients" value={String(c.churnedClients)} />
                  <Kpi label="Active subscriptions at start" value={String(c.activeAtStart)} />
                  <Kpi label="Churn rate" value={c.churnRate === null ? '—' : `${c.churnRate}%`} />
                </div>
                <DataTable rows={c.rows} rowKey={(r) => `${r.organizationId}-${r.date}-${r.event}`} onRowClick={(r) => navigate(`/tenants/${r.organizationId}`)} exportConfig={{ fileBase: 'churn', title: 'Churn report', generatedBy: admin?.email }}
                  columns={[
                    { id: 'date', header: 'Date', cell: (r) => formatDate(r.date), value: (r) => r.date, sortable: true },
                    { id: 'org', header: 'Organisation', cell: (r) => r.organization?.name ?? r.organizationId, value: (r) => r.organization?.name },
                    { id: 'event', header: 'Event', cell: (r) => humanize(r.event), value: (r) => r.event },
                    { id: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—', value: (r) => r.reason },
                    { id: 'by', header: 'By', cell: (r) => r.by, value: (r) => r.by },
                  ]} emptyTitle="No churn in this period" />
              </>
            )}
          </QueryState>
        </div>
      )}
    </div>
  );
}
