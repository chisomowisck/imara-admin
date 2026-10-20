import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, ChevronDown, Download, ShieldAlert } from 'lucide-react';
import { tenantsApi, type TenantAction, type TenantDetail } from '@/api/tenants';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, DescriptionList, PageHeader, StatusBadge, Tabs, Textarea } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime, humanize, timeAgo } from '@/lib/format';
import { ACTION_LABELS, ACTION_PERMISSIONS, useTenantActions } from './TenantActionDialogs';
import { tenantTabExtensions } from './tenantTabExtensions';

type TabId = 'overview' | 'users' | 'modules' | 'billing' | 'activity' | 'notes';

function OverviewTab({ t }: { t: TenantDetail }) {
  const last = t.statusHistory[0];
  return (
    <div className="space-y-4">
      <Card title="Lifecycle">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={t.status} />
          {t.statusChangedAt && <span className="text-xs text-zinc-500">since {formatDateTime(t.statusChangedAt)}</span>}
          {last && <span className="text-xs text-zinc-600 dark:text-zinc-400">Reason: <b>{last.reason}</b> · {last.actorEmail ?? last.actorType}</span>}
        </div>
        {t.status === 'ARCHIVED' && (
          <div className="mb-4">
            <Alert tone={t.retentionExpired ? 'danger' : 'warning'} title={t.retentionExpired ? 'Retention period has ended' : 'Archived (read-only)'}>
              Data is retained until <b>{formatDate(t.retentionEndsAt)}</b>.{' '}
              {t.retentionExpired ? 'A Super Administrator may now review and confirm permanent deletion. Deletion is never automatic.' : 'No one, including SmartTech, can modify this data.'}
            </Alert>
          </div>
        )}
        <DescriptionList
          items={[
            { label: 'Organisation ID', value: <span className="font-mono">{t.orgCode}</span> },
            { label: 'Provisioned', value: formatDateTime(t.provisionedAt ?? t.createdAt) },
            { label: 'Last login (any user)', value: t.lastLoginAt ? `${formatDateTime(t.lastLoginAt)} (${timeAgo(t.lastLoginAt)})` : 'Never' },
            { label: 'Subscription plan', value: (t.planName as string) ?? '—' },
            { label: 'Billing cycle', value: humanize(t.billingCycle as string) },
            { label: 'Trial ends', value: formatDate(t.trialEndsAt) },
          ]}
        />
      </Card>
      <Card title="Organisation record" actions={<span className="text-[11px] text-zinc-500">Read-only — editable only by the client in their workspace</span>}>
        <DescriptionList
          items={[
            { label: 'Legal name', value: t.name },
            { label: 'Type', value: humanize(t.type) },
            { label: 'Category', value: t.orgCategoryCode },
            { label: 'Industry / sector', value: t.industry },
            { label: 'Size', value: humanize(t.size) },
            { label: 'Employees', value: t.employeeCount },
            { label: 'Registration no.', value: t.registrationNumber },
            { label: 'TIN', value: t.tin },
            { label: 'Country', value: t.country },
            { label: 'Address', value: [t.addressLine1, t.addressLine2, t.town, t.district].filter(Boolean).join(', ') || null },
            { label: 'Primary contact', value: t.primaryContactName ?? `${t.createdBy.firstName} ${t.createdBy.lastName}` },
            { label: 'Contact email', value: t.primaryContactEmail ?? t.createdBy.email },
            { label: 'Contact phone', value: t.primaryContactPhone ?? t.phone },
            { label: 'Organisation email', value: t.email },
            { label: 'Website', value: t.website },
          ]}
        />
      </Card>
      <Card title="Status history" padded={false}>
        <DataTable
          rows={t.statusHistory}
          rowKey={(r) => r.id}
          columns={[
            { id: 'when', header: 'When', cell: (r) => formatDateTime(r.createdAt) },
            { id: 'change', header: 'Change', cell: (r) => <span className="flex items-center gap-1">{r.fromStatus ? <StatusBadge status={r.fromStatus} /> : '—'} → <StatusBadge status={r.toStatus} /></span> },
            { id: 'reason', header: 'Reason', cell: (r) => r.reason },
            { id: 'by', header: 'By', cell: (r) => r.actorEmail ?? r.actorType },
          ]}
          emptyTitle="No manual status changes yet"
        />
      </Card>
    </div>
  );
}

function UsersTab({ id }: { id: number }) {
  const users = useQuery({ queryKey: ['tenant', id, 'users'], queryFn: () => tenantsApi.users(id) });
  return (
    <>
      <p className="mb-2 text-xs text-zinc-500">Read-only. SmartTech cannot create, edit or delete tenant users.</p>
      <DataTable
        rows={users.data}
        loading={users.isLoading}
        error={users.error}
        onRetry={users.refetch}
        rowKey={(r) => r.memberId}
        exportConfig={{ fileBase: `organisation-${id}-users`, title: 'Organisation users' }}
        columns={[
          { id: 'name', header: 'Name', cell: (r) => r.name, value: (r) => r.name, sortable: true },
          { id: 'email', header: 'Email', cell: (r) => r.email, value: (r) => r.email, sortable: true },
          { id: 'roles', header: 'Role', cell: (r) => r.roles.join(', ') || '—', value: (r) => r.roles.join(', ') },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.memberStatus} />, value: (r) => r.memberStatus, sortable: true },
          { id: 'last', header: 'Last login', cell: (r) => timeAgo(r.lastLoginAt), value: (r) => r.lastLoginAt, sortable: true },
        ]}
        emptyTitle="No users"
      />
    </>
  );
}

function ActivityTab({ id }: { id: number }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const activity = useQuery({ queryKey: ['tenant', id, 'activity', page], queryFn: () => tenantsApi.activity(id, { page, limit: 25 }) });
  return (
    <DataTable
      rows={activity.data?.data}
      loading={activity.isLoading}
      error={activity.error}
      onRetry={activity.refetch}
      rowKey={(r) => r.id}
      pagination={activity.data?.meta}
      onPageChange={setPage}
      toolbar={(['xlsx', 'pdf', 'csv'] as const).map((f) => (
        <Button key={f} size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => tenantsApi.exportActivity(id, f).catch(toast.error)}>
          {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
        </Button>
      ))}
      columns={[
        { id: 'when', header: 'When', cell: (r) => formatDateTime(r.createdAt) },
        { id: 'who', header: 'Administrator', cell: (r) => r.actorEmail ?? r.actorType },
        { id: 'action', header: 'Action', cell: (r) => <span className="inline-flex items-center gap-1 font-mono text-xs">{r.isCritical && <ShieldAlert className="size-3.5 text-amber-500" />}{r.action}</span> },
        { id: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—' },
      ]}
      emptyTitle="No SmartTech actions on this organisation yet"
    />
  );
}

function NotesTab({ id }: { id: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [body, setBody] = useState('');
  const notes = useQuery({ queryKey: ['tenant', id, 'notes'], queryFn: () => tenantsApi.notes(id), enabled: can('tenants.notes') });
  const add = useMutation({
    mutationFn: () => tenantsApi.addNote(id, body),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['tenant', id, 'notes'] });
    },
    onError: toast.error,
  });
  if (!can('tenants.notes')) return <Alert tone="info">Your role cannot read internal notes.</Alert>;
  return (
    <div className="space-y-4">
      <Alert tone="info">Internal SmartTech notes. Never visible to the client or their users.</Alert>
      <Card>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" />
        <div className="mt-2 flex justify-end"><Button size="sm" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>Add note</Button></div>
      </Card>
      <QueryState query={notes} isEmpty={(d) => d.length === 0}>
        {(list) => (
          <ul className="space-y-2">
            {list.map((n) => (
              <li key={n.id} className="card p-3">
                <p className="text-xs text-zinc-500"><b className="text-zinc-700 dark:text-zinc-300">{n.authorName}</b> · {formatDateTime(n.createdAt)}</p>
                <p className="mt-1 text-[13px] whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export function TenantDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState<TabId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const tenant = useQuery({ queryKey: ['tenant', id], queryFn: () => tenantsApi.get(id) });
  const { open, dialogs } = useTenantActions(() => tenant.refetch());

  return (
    <QueryState query={tenant}>
      {(t) => {
        const actions = t.allowedActions.filter((a: TenantAction) => can(ACTION_PERMISSIONS[a]) && (a !== 'PURGE' || t.retentionExpired));
        const ext = tenantTabExtensions;
        const tabContent: Record<TabId, ReactNode> = {
          overview: <OverviewTab t={t} />,
          users: <UsersTab id={id} />,
          modules: ext.modules ? <ext.modules tenant={t} /> : <Alert tone="info">Module controls become available once plans are configured.</Alert>,
          billing: ext.billing ? <ext.billing tenant={t} /> : <Alert tone="info">Billing details become available once subscriptions are configured.</Alert>,
          activity: <ActivityTab id={id} />,
          notes: <NotesTab id={id} />,
        };
        return (
          <div>
            <PageHeader
              breadcrumb={<Link to="/tenants" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" /> Organisations</Link>}
              title={t.name}
              description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{t.orgCode}</span><StatusBadge status={t.status} />{t.planName ? <Badge tone="accent">{t.planName as string}</Badge> : null}</span>}
              actions={
                <>
                  {can('notifications.send') && t.status !== 'DELETED' && (
                    <Button variant="secondary" icon={<Bell className="size-4" />} onClick={() => navigate(`/notifications/new?tenants=${id}`)}>Send notification</Button>
                  )}
                  {ext.headerActions && <ext.headerActions tenant={t} onChanged={() => tenant.refetch()} />}
                  {actions.length > 0 && (
                    <div className="relative">
                      <Button variant="secondary" onClick={() => setMenuOpen((o) => !o)}>Lifecycle actions <ChevronDown className="size-3.5" /></Button>
                      {menuOpen && (
                        <div className="card absolute right-0 z-20 mt-1 w-56 p-1 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                          {actions.map((a) => (
                            <button key={a} className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 ${['SUSPEND', 'OFFBOARD', 'PURGE'].includes(a) ? 'text-red-600' : ''}`} onClick={() => { setMenuOpen(false); open(a, t); }}>
                              {ACTION_LABELS[a]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              }
            />
            <Tabs<TabId>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'users', label: `Users (${t._count.members})` },
                { id: 'modules', label: 'Modules' },
                { id: 'billing', label: 'Billing' },
                { id: 'activity', label: 'Activity log' },
                { id: 'notes', label: 'Notes', hidden: !can('tenants.notes') },
              ]}
            />
            {tabContent[tab]}
            {dialogs}
          </div>
        );
      }}
    </QueryState>
  );
}
