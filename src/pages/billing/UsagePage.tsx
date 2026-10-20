import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { subscriptionsApi, METRIC_LABELS, type UsageFigure } from '@/api/billing';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Badge, PageHeader, Select } from '@/components/ui/primitives';
import { useDebounce } from '@/hooks/useDebounce';
import { humanize } from '@/lib/format';

const STATE_TONES = { OK: 'success', NEAR_LIMIT: 'warning', AT_LIMIT: 'danger', OVER_LIMIT: 'danger' } as const;

function Cell({ f }: { f?: UsageFigure }) {
  if (!f) return null;
  return (
    <span className={f.state === 'OK' ? '' : f.state === 'NEAR_LIMIT' ? 'font-medium text-amber-600' : 'font-medium text-red-600'}>
      {f.used.toLocaleString()} / {f.limit ?? '∞'}
      {f.percent !== null && <span className="ml-1 text-xs text-zinc-500">({f.percent}%)</span>}
    </span>
  );
}

export function UsagePage() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const params = { page, limit: 25, state, search: debounced };
  const list = useQuery({ queryKey: ['usage', params], queryFn: () => subscriptionsApi.allUsage(params) });
  const fig = (row: { figures: UsageFigure[] }, m: UsageFigure['metric']) => row.figures.find((f) => f.metric === m);

  return (
    <div>
      <PageHeader title="Usage & limits" description="Active users, transactions and storage per organisation against plan limits. Storage is estimated from database usage." />
      <DataTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        rowKey={(r) => r.organization.id}
        pagination={list.data?.meta}
        onPageChange={setPage}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onRowClick={(r) => navigate(`/tenants/${r.organization.id}`)}
        filters={
          <Select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} className="w-44" aria-label="Limit state">
            <option value="">All organisations</option>
            <option value="NEAR_LIMIT">Approaching a limit</option>
            <option value="AT_LIMIT">At a limit</option>
            <option value="OVER_LIMIT">Over a limit</option>
          </Select>
        }
        exportConfig={{ fileBase: 'usage', title: 'Usage & limits', generatedBy: admin?.email }}
        columns={[
          { id: 'org', header: 'Organisation', cell: (r) => <div><p className="font-medium">{r.organization.name}</p><p className="font-mono text-xs text-zinc-500">{r.organization.orgCode}</p></div>, value: (r) => r.organization.name, sortable: true },
          { id: 'users', header: METRIC_LABELS.USERS, cell: (r) => <Cell f={fig(r, 'USERS')} />, value: (r) => fig(r, 'USERS')?.used, sortable: true },
          { id: 'tx', header: METRIC_LABELS.TRANSACTIONS_PER_MONTH, cell: (r) => <Cell f={fig(r, 'TRANSACTIONS_PER_MONTH')} />, value: (r) => fig(r, 'TRANSACTIONS_PER_MONTH')?.used, sortable: true },
          { id: 'storage', header: METRIC_LABELS.STORAGE_MB, cell: (r) => <Cell f={fig(r, 'STORAGE_MB')} />, value: (r) => fig(r, 'STORAGE_MB')?.used, sortable: true },
          { id: 'state', header: 'State', cell: (r) => <Badge tone={STATE_TONES[r.worst as keyof typeof STATE_TONES] ?? 'neutral'}>{humanize(r.worst)}</Badge>, value: (r) => r.worst, sortable: true },
        ]}
      />
    </div>
  );
}
