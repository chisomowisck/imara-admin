import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, X } from 'lucide-react';
import { notificationsApi, type Banner, type PlatformNotification } from '@/api/platform';
import { tenantsApi } from '@/api/tenants';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime, humanize } from '@/lib/format';

type PickedTenant = { id: number; name: string; orgCode?: string | null };

/** Search-and-pick list of organisations (used by compose and banners). */
function TenantPicker({ value, onChange }: { value: PickedTenant[]; onChange: (v: PickedTenant[]) => void }) {
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const results = useQuery({ queryKey: ['tenant-pick', q], queryFn: () => tenantsApi.list({ search: q, limit: 8 }), enabled: q.length > 1 });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-950 dark:text-accent-200">
            {t.name}
            <button type="button" aria-label={`Remove ${t.name}`} onClick={() => onChange(value.filter((x) => x.id !== t.id))}><X className="size-3" /></button>
          </span>
        ))}
        {!value.length && <span className="text-xs text-zinc-500">No organisations selected</span>}
      </div>
      <Input placeholder="Search organisations by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {results.data && q.length > 1 && (
        <div className="max-h-48 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          {results.data.data.map((t) => (
            <button key={t.id} type="button" disabled={value.some((x) => x.id === t.id)} onClick={() => { onChange([...value, { id: t.id, name: t.name, orgCode: t.orgCode }]); setSearch(''); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-zinc-50 disabled:opacity-40 dark:hover:bg-zinc-900">
              <span>{t.name} <span className="text-xs text-zinc-500">{t.orgCode}</span></span>
              <StatusBadge status={t.status} />
            </button>
          ))}
          {!results.data.data.length && <p className="px-3 py-2 text-xs text-zinc-500">No matches</p>}
        </div>
      )}
    </div>
  );
}

export function ComposeNotificationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const preset = (params.get('tenants') ?? '').split(',').map(Number).filter(Boolean);
  const [tenants, setTenants] = useState<PickedTenant[]>([]);
  const [audience, setAudience] = useState<'ONE' | 'SELECTED' | 'ALL'>(preset.length === 1 ? 'ONE' : preset.length ? 'SELECTED' : 'ALL');
  const [f, setF] = useState({ subject: '', body: '', type: 'INFORMATIONAL', sendEmail: true, schedule: false, scheduledAt: '' });
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!preset.length) return;
    Promise.all(preset.map((id) => tenantsApi.get(id).catch(() => null))).then((rows) =>
      setTenants(rows.filter(Boolean).map((t) => ({ id: t!.id, name: t!.name, orgCode: t!.orgCode }))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useMutation({
    mutationFn: () =>
      notificationsApi.compose({
        subject: f.subject,
        body: f.body,
        type: f.type,
        audience,
        organizationIds: audience === 'ALL' ? undefined : tenants.map((t) => t.id),
        sendEmail: f.sendEmail,
        scheduledAt: f.schedule && f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined,
      }),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(n.status === 'SCHEDULED' ? 'Notification scheduled' : `Sent to ${n.recipients} organisation(s)`);
      navigate('/notifications');
    },
    onError: (e) => { setConfirm(false); toast.error(e); },
  });

  const targetsOk = audience === 'ALL' || (audience === 'ONE' ? tenants.length === 1 : tenants.length > 0);
  const valid = f.subject.trim().length >= 3 && f.body.trim().length >= 3 && targetsOk && (!f.schedule || !!f.scheduledAt);

  return (
    <div className="max-w-3xl">
      <PageHeader title="New notification" description="Appears in each tenant's notification centre and, optionally, by email to the organisation's owners and admins." />
      <Card>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Audience" required>
              <Select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
                <option value="ALL">All active organisations</option>
                <option value="SELECTED">Selected organisations</option>
                <option value="ONE">One organisation</option>
              </Select>
            </Field>
            <Field label="Type" required>
              <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="INFORMATIONAL">Informational</option>
                <option value="WARNING">Warning</option>
                <option value="ACTION_REQUIRED">Action required</option>
              </Select>
            </Field>
          </div>
          {audience !== 'ALL' && (
            <Field label={audience === 'ONE' ? 'Organisation' : 'Organisations'} required>
              <TenantPicker value={tenants} onChange={(v) => setTenants(audience === 'ONE' ? v.slice(-1) : v)} />
            </Field>
          )}
          <Field label="Subject" required><Input value={f.subject} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Message" required><Textarea rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.sendEmail} onChange={(e) => setF({ ...f, sendEmail: e.target.checked })} /> Also send by email</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.checked })} /> Schedule for later</label>
          </div>
          {f.schedule && <Field label="Send at" required><Input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className="w-60" /></Field>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate('/notifications')}>Cancel</Button>
            <Button icon={<Send className="size-4" />} disabled={!valid} onClick={() => setConfirm(true)}>{f.schedule ? 'Schedule' : 'Send'}</Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => send.mutate()}
        loading={send.isPending}
        title={f.schedule ? 'Schedule notification?' : 'Send notification?'}
        message={audience === 'ALL' ? 'This goes to every active organisation.' : `This goes to ${tenants.length} organisation(s).`}
        confirmLabel={f.schedule ? 'Schedule' : 'Send now'}
      />
    </div>
  );
}

function DeliveriesModal({ n, onClose }: { n: PlatformNotification; onClose: () => void }) {
  const d = useQuery({ queryKey: ['deliveries', n.id], queryFn: () => notificationsApi.deliveries(n.id) });
  return (
    <Modal open onClose={onClose} title={n.subject} size="lg">
      <p className="mb-3 whitespace-pre-wrap text-[13px] text-zinc-600 dark:text-zinc-300">{n.body}</p>
      <DataTable rows={d.data} loading={d.isLoading} error={d.error} rowKey={(r) => r.id} exportConfig={{ fileBase: `notification-${n.id}-deliveries`, title: `Deliveries: ${n.subject}` }}
        columns={[
          { id: 'org', header: 'Organisation', cell: (r) => r.organization?.name ?? `#${r.organizationId}`, value: (r) => r.organization?.name },
          { id: 'inapp', header: 'In-app recipients', cell: (r) => r.inAppCount, value: (r) => r.inAppCount },
          { id: 'email', header: 'Email', cell: (r) => (r.emailStatus ? <StatusBadge status={r.emailStatus} /> : '—'), value: (r) => r.emailStatus },
        ]} emptyTitle="No deliveries yet" />
    </Modal>
  );
}

const BANNER_TONES: Record<Banner['type'], 'info' | 'warning' | 'danger'> = { INFO: 'info', WARNING: 'warning', MAINTENANCE: 'warning', ACTION_REQUIRED: 'danger' };

function BannerForm({ banner, onClose }: { banner?: Banner; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    type: banner?.type ?? 'INFO',
    title: banner?.title ?? '',
    message: banner?.message ?? '',
    audience: banner?.audience ?? 'ALL',
    startsAt: banner?.startsAt?.slice(0, 16) ?? '',
    endsAt: banner?.endsAt?.slice(0, 16) ?? '',
    dismissible: banner?.dismissible ?? true,
    isActive: banner?.isActive ?? true,
  });
  const [tenants, setTenants] = useState<PickedTenant[]>((banner?.targetOrgIds ?? []).map((id) => ({ id, name: `#${id}` })));
  const save = useMutation({
    mutationFn: () =>
      notificationsApi.saveBanner({
        id: banner?.id,
        type: f.type as Banner['type'],
        title: f.title,
        message: f.message,
        audience: f.audience as Banner['audience'],
        organizationIds: f.audience === 'SELECTED' ? tenants.map((t) => t.id) : undefined,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        dismissible: f.dismissible,
        isActive: f.isActive,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['banners'] }); toast.success('Banner saved'); onClose(); },
    onError: toast.error,
  });
  return (
    <div className="space-y-3">
      <Alert tone={BANNER_TONES[f.type as Banner['type']]} title={f.title || 'Preview title'}>{f.message || 'Banner message preview'}</Alert>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" required><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Banner['type'] })}>{(['INFO', 'WARNING', 'MAINTENANCE', 'ACTION_REQUIRED'] as const).map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Shown to" required><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Banner['audience'] })}><option value="ALL">All organisations</option><option value="SELECTED">Selected organisations</option></Select></Field>
      </div>
      {f.audience === 'SELECTED' && <Field label="Organisations" required><TenantPicker value={tenants} onChange={setTenants} /></Field>}
      <Field label="Title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Message" required><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts" hint="Empty = immediately"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Ends" hint="Empty = until turned off"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.dismissible} onChange={(e) => setF({ ...f, dismissible: e.target.checked })} /> Users can dismiss</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>
      </div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!f.title.trim() || !f.message.trim() || (f.audience === 'SELECTED' && !tenants.length)} onClick={() => save.mutate()}>Save banner</Button></div>
    </div>
  );
}

function BannersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const banners = useQuery({ queryKey: ['banners'], queryFn: notificationsApi.banners });
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => notificationsApi.deleteBanner(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['banners'] }); setDeleting(null); toast.success('Banner removed'); },
    onError: toast.error,
  });
  return (
    <>
      <div className="mb-3 flex justify-end"><Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New banner</Button></div>
      <DataTable rows={banners.data} loading={banners.isLoading} error={banners.error} onRetry={banners.refetch} rowKey={(r) => r.id} onRowClick={setEditing}
        columns={[
          { id: 'type', header: 'Type', cell: (r) => <Badge tone={BANNER_TONES[r.type] === 'danger' ? 'danger' : BANNER_TONES[r.type] === 'warning' ? 'warning' : 'info'}>{humanize(r.type)}</Badge>, value: (r) => r.type },
          { id: 'title', header: 'Title', cell: (r) => r.title, value: (r) => r.title },
          { id: 'aud', header: 'Shown to', cell: (r) => (r.audience === 'ALL' ? 'All' : `${r.targetOrgIds?.length ?? 0} organisation(s)`), value: (r) => r.audience },
          { id: 'window', header: 'Window', cell: (r) => `${r.startsAt ? formatDateTime(r.startsAt) : 'Now'} → ${r.endsAt ? formatDateTime(r.endsAt) : 'Open'}`, hideOnMobile: true },
          { id: 'active', header: 'Status', cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>), value: (r) => r.isActive },
          { id: 'act', header: '', exportable: false, cell: (r) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleting(r); }}>Delete</Button> },
        ]} emptyTitle="No banners" />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New banner' : 'Edit banner'} size="lg">
        {editing && <BannerForm banner={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} title="Delete banner?" message={`"${deleting?.title}" will stop showing to tenants.`} confirmLabel="Delete" tone="danger" />
    </>
  );
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { admin, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'history' | 'banners') || 'history';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState<PlatformNotification | null>(null);
  const list = useQuery({ queryKey: ['notifications', page, status], queryFn: () => notificationsApi.list({ page, limit: 25, status: status || undefined }), enabled: tab === 'history' });
  const act = useMutation({
    mutationFn: ({ id, op }: { id: number; op: 'cancel' | 'send' }) => (op === 'cancel' ? notificationsApi.cancel(id) : notificationsApi.sendNow(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast.success('Done'); },
    onError: toast.error,
  });
  return (
    <div>
      <PageHeader title="Notification centre" description="Messages and banners sent to client organisations." actions={can('notifications.send') ? <Button icon={<Plus className="size-4" />} onClick={() => navigate('/notifications/new')}>New notification</Button> : undefined} />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[{ id: 'history', label: 'Sent & scheduled' }, { id: 'banners', label: 'Banners', hidden: !can('banners.manage') }]} />
      {tab === 'history' && (
        <DataTable
          rows={list.data?.data}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          rowKey={(r) => r.id}
          pagination={list.data?.meta}
          onPageChange={setPage}
          onRowClick={setViewing}
          filters={<Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36" aria-label="Status"><option value="">All</option>{['SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</Select>}
          exportConfig={{ fileBase: 'notifications', title: 'Notifications', generatedBy: admin?.email }}
          columns={[
            { id: 'at', header: 'Created', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt, sortable: true },
            { id: 'subject', header: 'Subject', cell: (r) => <span className="font-medium">{r.subject}</span>, value: (r) => r.subject },
            { id: 'type', header: 'Type', cell: (r) => humanize(r.type), value: (r) => r.type },
            { id: 'aud', header: 'Audience', cell: (r) => (r.audience === 'ALL' ? 'All' : `${r.targetOrgIds?.length ?? 0} org(s)`), value: (r) => r.audience },
            { id: 'rec', header: 'Delivered', cell: (r) => `${r.recipients}${r.sendEmail ? ` · ${r.emailsSent} emails` : ''}`, value: (r) => r.recipients, hideOnMobile: true },
            { id: 'when', header: 'Sent / scheduled', cell: (r) => formatDateTime(r.sentAt ?? r.scheduledAt), value: (r) => r.sentAt ?? r.scheduledAt, hideOnMobile: true },
            { id: 'by', header: 'By', cell: (r) => r.createdByName, value: (r) => r.createdByName, hideOnMobile: true },
            { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
            {
              id: 'act', header: '', exportable: false,
              cell: (r) => r.status === 'SCHEDULED' && can('notifications.send') ? (
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, op: 'send' })}>Send now</Button>
                  <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, op: 'cancel' })}>Cancel</Button>
                </div>
              ) : null,
            },
          ]}
          emptyTitle="No notifications sent yet"
        />
      )}
      {tab === 'banners' && <BannersTab />}
      {viewing && <DeliveriesModal n={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
