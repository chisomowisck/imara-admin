import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { plansApi, subscriptionsApi } from '@/api/billing';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Badge, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatMoney, humanize } from '@/lib/format';

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const debounced = useDebounce(search);
  const params = { page, limit: 25, search: debounced, status, planId };
  const list = useQuery({ queryKey: ['subscriptions', params], queryFn: () => subscriptionsApi.list(params) });
  const plans = useQuery({ queryKey: ['plans'], queryFn: plansApi.list });

  return (
    <div>
      <PageHeader title="Subscriptions" description="Every tenant subscription. One live subscription per organisation." />
      <DataTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        rowKey={(r) => r.id}
        pagination={list.data?.meta}
        onPageChange={setPage}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search organisation…"
        onRowClick={(r) => navigate(`/tenants/${r.organizationId}`)}
        filters={
          <>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              {['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
            <Select value={planId} onChange={(e) => { setPlanId(e.target.value); setPage(1); }} className="w-40" aria-label="Plan">
              <option value="">All plans</option>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </>
        }
        exportConfig={{ fileBase: 'subscriptions', title: 'Subscriptions', generatedBy: admin?.email, fetchAll: async () => (await subscriptionsApi.list({ ...params, page: 1, limit: 100 })).data }}
        columns={[
          { id: 'org', header: 'Organisation', cell: (r) => <div><p className="font-medium">{r.organization?.name}</p><p className="font-mono text-xs text-zinc-500">{r.organization?.orgCode}</p></div>, value: (r) => r.organization?.name },
          { id: 'plan', header: 'Plan', cell: (r) => <span>{r.plan.name} <span className="text-xs text-zinc-500">v{r.planVersion.version}</span>{r.isLegacy && <Badge className="ml-1">Legacy</Badge>}</span>, value: (r) => r.plan.name },
          { id: 'cycle', header: 'Cycle', cell: (r) => humanize(r.billingCycle), value: (r) => r.billingCycle },
          { id: 'price', header: 'Price', cell: (r) => formatMoney(r.billingCycle === 'ANNUAL' ? r.planVersion.annualPrice : r.planVersion.monthlyPrice), value: (r) => Number(r.billingCycle === 'ANNUAL' ? r.planVersion.annualPrice : r.planVersion.monthlyPrice), hideOnMobile: true },
          { id: 'status', header: 'Status', cell: (r) => <div className="flex gap-1"><StatusBadge status={r.status} />{r.cancelAtPeriodEnd && <Badge tone="warning">Cancelling</Badge>}</div>, value: (r) => r.status },
          { id: 'renew', header: 'Auto-renew', cell: (r) => (r.autoRenew ? 'Yes' : 'No'), value: (r) => (r.autoRenew ? 'Yes' : 'No'), hideOnMobile: true },
          { id: 'trial', header: 'Trial ends', cell: (r) => formatDate(r.trialEndsAt), value: (r) => r.trialEndsAt, hideOnMobile: true },
          { id: 'next', header: 'Next invoice', cell: (r) => formatDate(r.nextBillingDate), value: (r) => r.nextBillingDate },
        ]}
      />
    </div>
  );
}
