import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, MoreHorizontal, PauseCircle } from 'lucide-react';
import { SUSPEND_REASONS, tenantsApi, type TenantRow } from '@/api/tenants';
import { useAuth } from '@/auth/AuthContext';
import { DataTable, type SortState } from '@/components/table/DataTable';
import { Badge, Button, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { ReasonDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, timeAgo } from '@/lib/format';
import { ACTION_LABELS, ACTION_PERMISSIONS, useTenantActions } from './TenantActionDialogs';

const SORT_MAP: Record<string, string> = { orgCode: 'orgCode', name: 'name', status: 'status', provisioned: 'provisionedAt', lastLogin: 'lastLoginAt' };

export function TenantsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { admin, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>({ id: 'provisioned', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [menu, setMenu] = useState<number | null>(null);
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false);
  const debounced = useDebounce(search);
  const { open, dialogs } = useTenantActions();

  const status = params.get('status') ?? '';
  const provisionedFrom = params.get('provisionedFrom') ?? '';
  const provisionedTo = params.get('provisionedTo') ?? '';
  const overdue = params.get('overdue') ?? '';
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const query = {
    page,
    limit: 25,
    search: debounced,
    status,
    provisionedFrom: provisionedFrom ? new Date(provisionedFrom).toISOString() : undefined,
    provisionedTo: provisionedTo ? new Date(`${provisionedTo}T23:59:59`).toISOString() : undefined,
    overdue: overdue || undefined,
    sortBy: sort ? SORT_MAP[sort.id] : undefined,
    sortDir: sort?.dir,
  };
  const list = useQuery({ queryKey: ['tenants', query], queryFn: () => tenantsApi.list(query) });

  const bulkSuspend = useMutation({
    mutationFn: (reason: string) => tenantsApi.bulkSuspend([...selected].map(Number), reason),
    onSuccess: (r) => {
      toast.success(`${r.succeeded} suspended${r.failed ? `, ${r.failed} skipped (not in a suspendable status)` : ''}`);
      setBulkSuspendOpen(false);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: toast.error,
  });

  const serverExport = async (format: 'csv' | 'xlsx' | 'pdf', ids?: number[]) => {
    try {
      await tenantsApi.export({ ...query, page: undefined, limit: undefined, format, ids: ids?.join(',') });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Organisations"
        description="Every client organisation on the Imara platform and its lifecycle status."
        actions={
          can('tenants.export') && (
            <>
              {(['xlsx', 'pdf', 'csv'] as const).map((f) => (
                <Button key={f} size="sm" variant="secondary" onClick={() => serverExport(f)}>Export {f === 'xlsx' ? 'Excel' : f.toUpperCase()}</Button>
              ))}
            </>
          )
        }
      />
      <DataTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        rowKey={(r) => r.id}
        pagination={list.data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search name, ID, contact, email…"
        onRowClick={(r) => navigate(`/tenants/${r.id}`)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={(rows) => (
          <>
            {can('tenants.suspend') && <Button size="sm" variant="danger" icon={<PauseCircle className="size-3.5" />} onClick={() => setBulkSuspendOpen(true)}>Suspend selected</Button>}
            {can('notifications.send') && <Button size="sm" variant="secondary" icon={<Bell className="size-3.5" />} onClick={() => navigate(`/notifications/new?tenants=${rows.map((r) => r.id).join(',')}`)}>Send notification</Button>}
            {can('tenants.export') && (['xlsx', 'pdf', 'csv'] as const).map((f) => (
              <Button key={f} size="sm" variant="secondary" onClick={() => serverExport(f, rows.map((r) => r.id))}>Export {f === 'xlsx' ? 'Excel' : f.toUpperCase()}</Button>
            ))}
          </>
        )}
        filters={
          <>
            <Select value={status} onChange={(e) => setFilter('status', e.target.value)} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              <option value="ACTIVE,TRIAL,GRACE_PERIOD">Active (incl. trial)</option>
              <option value="TRIAL">Trial</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
              <option value="DELETED">Deleted</option>
            </Select>
            <Select value={overdue} onChange={(e) => setFilter('overdue', e.target.value)} className="w-40" aria-label="Billing">
              <option value="">Any billing state</option>
              <option value="true">Has overdue invoices</option>
            </Select>
            <label className="flex items-center gap-1 text-xs text-zinc-500">Provisioned
              <Input type="date" value={provisionedFrom} onChange={(e) => setFilter('provisionedFrom', e.target.value)} className="w-36" aria-label="Provisioned from" />
              –
              <Input type="date" value={provisionedTo} onChange={(e) => setFilter('provisionedTo', e.target.value)} className="w-36" aria-label="Provisioned to" />
            </label>
          </>
        }
        columns={[
          { id: 'orgCode', header: 'Org ID', cell: (r) => <span className="font-mono text-xs">{r.orgCode}</span>, value: (r) => r.orgCode, sortable: true },
          { id: 'name', header: 'Organisation', cell: (r: TenantRow) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-zinc-500">{r.primaryContactEmail ?? r.email}</p></div>, value: (r) => r.name, sortable: true },
          { id: 'plan', header: 'Plan', cell: (r) => (r.planName ? <span>{r.planName}<span className="ml-1 text-xs text-zinc-500">{r.billingCycle?.toLowerCase()}</span></span> : <span className="text-zinc-400">—</span>), value: (r) => r.planName ?? '' },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status, sortable: true },
          { id: 'provisioned', header: 'Provisioned', cell: (r) => formatDate(r.provisionedAt ?? r.createdAt), value: (r) => r.provisionedAt ?? r.createdAt, sortable: true, hideOnMobile: true },
          { id: 'lastLogin', header: 'Last login', cell: (r) => timeAgo(r.lastLoginAt), value: (r) => r.lastLoginAt, sortable: true, hideOnMobile: true },
          { id: 'users', header: 'Users', cell: (r) => <Badge>{r.activeUsers}</Badge>, value: (r) => r.activeUsers, hideOnMobile: true },
          {
            id: 'actions', header: '', exportable: false, className: 'w-10 text-right',
            cell: (r) => {
              const quick = r.allowedActions.filter((a) => (a === 'SUSPEND' || a === 'REACTIVATE') && can(ACTION_PERMISSIONS[a]));
              if (!quick.length) return null;
              return (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" aria-label="Quick actions" onClick={() => setMenu(menu === r.id ? null : r.id)}><MoreHorizontal className="size-4" /></Button>
                  {menu === r.id && (
                    <div className="card absolute right-0 z-20 mt-1 w-40 p-1 text-left shadow-lg" onMouseLeave={() => setMenu(null)}>
                      {quick.map((a) => (
                        <button key={a} className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 ${a === 'SUSPEND' ? 'text-red-600' : ''}`} onClick={() => { setMenu(null); open(a, r); }}>
                          {ACTION_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            },
          },
        ]}
        exportConfig={undefined}
        emptyTitle="No organisations match"
        emptyDescription="Organisations appear here automatically when clients register."
      />
      {dialogs}
      <ReasonDialog
        open={bulkSuspendOpen}
        onClose={() => setBulkSuspendOpen(false)}
        title={`Suspend ${selected.size} organisation(s)`}
        description="Each organisation's users are signed out immediately. Organisations not in a suspendable status are skipped."
        presetReasons={SUSPEND_REASONS}
        confirmLabel="Suspend selected"
        loading={bulkSuspend.isPending}
        onConfirm={(reason) => bulkSuspend.mutate(reason)}
      />
      <p className="mt-3 text-[11px] text-zinc-400">Signed in as {admin?.email}. All actions are recorded in the audit trail.</p>
    </div>
  );
}
