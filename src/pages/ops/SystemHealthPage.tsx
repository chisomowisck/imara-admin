import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Play, RefreshCw, RotateCcw, CheckCircle2 } from 'lucide-react';
import { opsApi, reportsApi, type JobStatus } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { Can } from '@/auth/guards';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, PageHeader, Select, StatusBadge, Tabs } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, humanize, timeAgo } from '@/lib/format';

type TabId = 'overview' | 'jobs' | 'failed' | 'webhooks' | 'emails';
const TAB_IDS: TabId[] = ['overview', 'jobs', 'failed', 'webhooks', 'emails'];

type JobRun = NonNullable<JobStatus['lastRun']>;
type FailedJob = Awaited<ReturnType<typeof opsApi.failedJobs>>[number];
type Webhook = Awaited<ReturnType<typeof opsApi.webhooks>>[number];
type EmailLog = Awaited<ReturnType<typeof opsApi.emailLogs>>[number];

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-zinc-400">—</span>;
  return <pre className="max-h-80 overflow-auto rounded bg-zinc-50 p-2 font-mono text-[11px] dark:bg-zinc-950">{JSON.stringify(value, null, 2)}</pre>;
}

function RunStatusBadge({ status }: { status: string | null | undefined }) {
  if (status === 'RUNNING') return <Badge tone="info">RUNNING</Badge>;
  if (status === 'SKIPPED') return <Badge tone="neutral">SKIPPED</Badge>;
  return <StatusBadge status={status} />;
}

function formatUptime(seconds: unknown) {
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function num(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={tone === 'danger' ? 'mt-1 text-2xl font-semibold text-red-600' : tone === 'warning' ? 'mt-1 text-2xl font-semibold text-amber-600' : 'mt-1 text-2xl font-semibold'}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab() {
  const stats = useQuery({ queryKey: ['ops-stats'], queryFn: reportsApi.stats, refetchInterval: 60_000 });
  return (
    <QueryState query={stats}>
      {(s) => {
        const byStatus: Record<string, number> = s?.tenantsByStatus ?? {};
        const totalTenants = Object.values(byStatus).reduce((a, b) => a + Number(b || 0), 0);
        const failedJobs = Number(s?.unresolvedFailedJobs ?? 0);
        const webhooks = Number(s?.problemWebhooks ?? 0);
        const emails = Number(s?.failedEmails7d ?? 0);
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Generated {s?.generatedAt ? `${formatDateTime(s.generatedAt)} (${timeAgo(s.generatedAt)})` : '—'} · refreshes every 60s</span>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={stats.isFetching} onClick={() => stats.refetch()}>
                Refresh
              </Button>
            </div>
            <Card title={`Tenants by status (${totalTenants.toLocaleString()})`}>
              {Object.keys(byStatus).length === 0 ? (
                <p className="text-[13px] text-zinc-500">No tenants yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {Object.entries(byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                      <StatusBadge status={status} />
                      <span className="text-lg font-semibold">{num(count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Active users" value={num(s?.activeUsers)} />
              <Kpi label="Logins (24h)" value={num(s?.logins24h)} />
              <Kpi label="Logins (7 days)" value={num(s?.logins7d)} />
              <Kpi label="Organisations active (7 days)" value={num(s?.organisationsActive7d)} />
              <Kpi label="Invoices issued" value={num(s?.invoicesIssued)} />
              <Kpi label="Unresolved failed jobs" value={num(s?.unresolvedFailedJobs)} tone={failedJobs > 0 ? 'danger' : undefined} />
              <Kpi label="Problem webhooks" value={num(s?.problemWebhooks)} hint="Failed or invalid signature" tone={webhooks > 0 ? 'warning' : undefined} />
              <Kpi label="Failed emails (7 days)" value={num(s?.failedEmails7d)} tone={emails > 0 ? 'warning' : undefined} />
              <Kpi label="Database size" value={s?.databaseSize ?? '—'} />
              <Kpi label="API uptime" value={formatUptime(s?.uptimeSeconds)} hint="Since last API restart" />
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

// ---------- Scheduled jobs ----------

function JobsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ['ops-jobs'], queryFn: opsApi.jobs });
  const [confirm, setConfirm] = useState<JobStatus | null>(null);
  const [history, setHistory] = useState<JobStatus | null>(null);
  const runs = useQuery({ queryKey: ['ops-job-runs', history?.name], queryFn: () => opsApi.runs(history!.name), enabled: !!history });

  const run = useMutation({
    mutationFn: (name: string) => opsApi.run(name),
    onSuccess: (r, name) => {
      setConfirm(null);
      const summary = r?.summary ? ` — ${JSON.stringify(r.summary)}` : '';
      const msg = `${name}: ${r?.status ?? 'done'} · processed ${r?.processed ?? 0}, failed ${r?.failed ?? 0}${summary}`;
      if (r?.status === 'FAILED' || (r?.failed ?? 0) > 0) toast.error(r?.error ? `${msg} (${r.error})` : msg);
      else toast.success(msg);
      qc.invalidateQueries({ queryKey: ['ops-jobs'] });
      qc.invalidateQueries({ queryKey: ['ops-job-runs', name] });
      qc.invalidateQueries({ queryKey: ['ops-failed-jobs'] });
      qc.invalidateQueries({ queryKey: ['ops-stats'] });
    },
    onError: toast.error,
  });

  return (
    <>
      <DataTable
        rows={jobs.data}
        loading={jobs.isLoading}
        error={jobs.error}
        onRetry={jobs.refetch}
        rowKey={(r) => r.name}
        exportConfig={{ fileBase: 'scheduled-jobs', title: 'Scheduled jobs' }}
        emptyTitle="No scheduled jobs registered"
        columns={[
          {
            id: 'name',
            header: 'Job',
            cell: (r) => (
              <div>
                <p className="font-mono text-xs font-medium">{r.name}</p>
                <p className="line-clamp-2 max-w-xs text-[11px] text-zinc-500">{r.description}</p>
              </div>
            ),
            value: (r) => r.name,
            sortable: true,
          },
          { id: 'schedule', header: 'Schedule', cell: (r) => <span className="font-mono text-xs">{r.schedule}</span>, value: (r) => r.schedule, hideOnMobile: true },
          { id: 'status', header: 'Last run', cell: (r) => <RunStatusBadge status={r.lastRun?.status} />, value: (r) => r.lastRun?.status, sortable: true },
          {
            id: 'lastRunAt',
            header: 'Ran at',
            cell: (r) =>
              r.lastRun ? (
                <div className="whitespace-nowrap">
                  <p>{formatDateTime(r.lastRun.startedAt)}</p>
                  <p className="text-[11px] text-zinc-500">{humanize(r.lastRun.trigger)}</p>
                </div>
              ) : (
                <span className="text-zinc-400">Never</span>
              ),
            value: (r) => r.lastRun?.startedAt,
            sortable: true,
            hideOnMobile: true,
          },
          {
            id: 'counts',
            header: 'Processed / failed',
            cell: (r) =>
              r.lastRun ? (
                <span>
                  {r.lastRun.processed} / <span className={r.lastRun.failed > 0 ? 'font-semibold text-red-600' : undefined}>{r.lastRun.failed}</span>
                </span>
              ) : (
                '—'
              ),
            value: (r) => (r.lastRun ? `${r.lastRun.processed}/${r.lastRun.failed}` : ''),
            hideOnMobile: true,
          },
          { id: 'success', header: 'Last success', cell: (r) => (r.lastSuccessAt ? timeAgo(r.lastSuccessAt) : <span className="text-zinc-400">Never</span>), value: (r) => r.lastSuccessAt, sortable: true, hideOnMobile: true },
          {
            id: 'actions',
            header: '',
            exportable: false,
            cell: (r) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Can all={['ops.manage']}>
                  <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} disabled={r.lastRun?.status === 'RUNNING'} onClick={() => setConfirm(r)}>
                    Run now
                  </Button>
                </Can>
                <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setHistory(r)}>
                  History
                </Button>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && run.mutate(confirm.name)}
        loading={run.isPending}
        tone="primary"
        title={`Run ${confirm?.name ?? ''} now?`}
        confirmLabel="Run now"
        message={
          <div className="space-y-2">
            <p>{confirm?.description}</p>
            <p>Scheduled jobs are idempotent: items already handled for this period are skipped, so it is safe to re-run a job. The run is recorded with a manual trigger in the audit trail.</p>
          </div>
        }
      />
      <Modal open={!!history} onClose={() => setHistory(null)} title={`Run history — ${history?.name ?? ''}`} size="xl">
        <QueryState query={runs} isEmpty={(d) => d.length === 0}>
          {(list) => (
            <ul className="space-y-3">
              {list.map((r: JobRun) => (
                <li key={r.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <RunStatusBadge status={r.status} />
                    <span>{formatDateTime(r.startedAt)}</span>
                    <span className="text-zinc-500">→ {r.finishedAt ? formatDateTime(r.finishedAt) : 'still running'}</span>
                    <Badge>{humanize(r.trigger)}</Badge>
                    <span className="ml-auto text-xs text-zinc-500">
                      processed {r.processed} · failed {r.failed}
                    </span>
                  </div>
                  {r.error && <p className="mt-2 text-xs text-red-600">{r.error}</p>}
                  {r.summary && (
                    <div className="mt-2">
                      <Json value={r.summary} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Modal>
    </>
  );
}

// ---------- Failed jobs ----------

function FailedJobsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [showResolved, setShowResolved] = useState(false);
  const failed = useQuery({ queryKey: ['ops-failed-jobs'], queryFn: opsApi.failedJobs });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ops-failed-jobs'] });
    qc.invalidateQueries({ queryKey: ['ops-stats'] });
  };
  const retry = useMutation({
    mutationFn: (id: number) => opsApi.retryFailed(id),
    onSuccess: (r) => {
      if (r?.retried) toast.success(`Retried successfully${r.result !== undefined ? ` — ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}` : ''}`);
      else toast.error(r?.error ?? (typeof r?.result === 'string' ? r.result : 'Retry did not succeed'));
      refresh();
    },
    onError: toast.error,
  });
  const resolve = useMutation({
    mutationFn: (id: number) => opsApi.resolveFailed(id),
    onSuccess: () => {
      toast.success('Marked as resolved');
      refresh();
    },
    onError: toast.error,
  });
  const rows = (failed.data ?? []).filter((r) => showResolved || !r.resolvedAt);

  return (
    <DataTable<FailedJob>
      rows={failed.data ? rows : undefined}
      loading={failed.isLoading}
      error={failed.error}
      onRetry={failed.refetch}
      rowKey={(r) => r.id}
      exportConfig={{ fileBase: 'failed-jobs', title: 'Failed jobs' }}
      emptyTitle={showResolved ? 'No failed jobs' : 'No unresolved failed jobs'}
      filters={
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="accent-accent-600" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      }
      columns={[
        { id: 'job', header: 'Job', cell: (r) => <span className="font-mono text-xs">{r.jobName}</span>, value: (r) => r.jobName, sortable: true },
        { id: 'item', header: 'Item', cell: (r) => (r.itemType || r.itemId ? `${r.itemType ?? ''} #${r.itemId ?? ''}` : '—'), value: (r) => `${r.itemType ?? ''} ${r.itemId ?? ''}`.trim(), hideOnMobile: true },
        { id: 'error', header: 'Error', cell: (r) => <span className="line-clamp-2 max-w-sm text-xs text-red-700 dark:text-red-300" title={r.error}>{r.error}</span>, value: (r) => r.error },
        { id: 'attempts', header: 'Attempts', cell: (r) => r.attempts, value: (r) => r.attempts, sortable: true, hideOnMobile: true },
        { id: 'last', header: 'Last attempt', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.lastAttemptAt)}</span>, value: (r) => r.lastAttemptAt, sortable: true, hideOnMobile: true },
        {
          id: 'resolved',
          header: 'Resolved',
          cell: (r) => (r.resolvedAt ? <Badge tone="success">Resolved {timeAgo(r.resolvedAt)}</Badge> : <Badge tone="danger">Open</Badge>),
          value: (r) => (r.resolvedAt ? 'Resolved' : 'Open'),
          sortable: true,
        },
        {
          id: 'actions',
          header: '',
          exportable: false,
          cell: (r) =>
            !r.resolvedAt && can('ops.manage') ? (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={retry.isPending && retry.variables === r.id} onClick={() => retry.mutate(r.id)}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} loading={resolve.isPending && resolve.variables === r.id} onClick={() => resolve.mutate(r.id)}>
                  Mark resolved
                </Button>
              </div>
            ) : null,
        },
      ]}
    />
  );
}

// ---------- Webhooks ----------

function WebhooksTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [selected, setSelected] = useState<Webhook | null>(null);
  const hooks = useQuery({ queryKey: ['ops-webhooks'], queryFn: opsApi.webhooks });
  const reprocess = useMutation({
    mutationFn: (id: number) => opsApi.reprocess(id),
    onSuccess: () => {
      toast.success('Webhook reprocessed');
      qc.invalidateQueries({ queryKey: ['ops-webhooks'] });
      qc.invalidateQueries({ queryKey: ['ops-stats'] });
    },
    onError: toast.error,
  });
  const canReprocess = (r: Webhook) => can('ops.manage') && r.signatureValid && r.status !== 'PROCESSED';

  return (
    <div className="space-y-3">
      <Alert tone="info">Invalid signatures are never processed. Duplicate deliveries are ignored automatically.</Alert>
      <DataTable<Webhook>
        rows={hooks.data}
        loading={hooks.isLoading}
        error={hooks.error}
        onRetry={hooks.refetch}
        rowKey={(r) => r.id}
        onRowClick={setSelected}
        exportConfig={{ fileBase: 'payment-webhooks', title: 'Payment webhooks' }}
        emptyTitle="No webhook events received"
        columns={[
          { id: 'received', header: 'Received', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.receivedAt)}</span>, value: (r) => r.receivedAt, sortable: true },
          { id: 'gateway', header: 'Gateway', cell: (r) => r.gateway, value: (r) => r.gateway, sortable: true },
          { id: 'event', header: 'Event type', cell: (r) => <span className="font-mono text-xs">{r.eventType ?? '—'}</span>, value: (r) => r.eventType, sortable: true, hideOnMobile: true },
          { id: 'reference', header: 'Reference', cell: (r) => <span className="font-mono text-xs">{r.reference ?? '—'}</span>, value: (r) => r.reference, hideOnMobile: true },
          { id: 'signature', header: 'Signature', cell: (r) => (r.signatureValid ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Invalid</Badge>), value: (r) => (r.signatureValid ? 'Valid' : 'Invalid'), sortable: true },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status, sortable: true },
          { id: 'attempts', header: 'Attempts', cell: (r) => r.attempts, value: (r) => r.attempts, sortable: true, hideOnMobile: true },
          { id: 'error', header: 'Error', cell: (r) => <span className="line-clamp-1 max-w-xs text-xs text-red-700 dark:text-red-300">{r.error ?? ''}</span>, value: (r) => r.error, hideOnMobile: true },
          {
            id: 'actions',
            header: '',
            exportable: false,
            cell: (r) =>
              canReprocess(r) ? (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={reprocess.isPending && reprocess.variables === r.id} onClick={() => reprocess.mutate(r.id)}>
                    Reprocess
                  </Button>
                </div>
              ) : null,
          },
        ]}
      />
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`${selected?.gateway ?? ''} · ${selected?.eventType ?? 'event'}`}
        size="lg"
        footer={
          selected && canReprocess(selected) ? (
            <Button
              icon={<RotateCcw className="size-3.5" />}
              loading={reprocess.isPending}
              onClick={() => reprocess.mutate(selected.id, { onSuccess: () => setSelected(null) })}
            >
              Reprocess
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p><span className="text-zinc-500">Event ID:</span> <span className="font-mono text-xs">{selected.eventId}</span></p>
              <p><span className="text-zinc-500">Reference:</span> {selected.reference ?? '—'}</p>
              <p><span className="text-zinc-500">Received:</span> {formatDateTime(selected.receivedAt)}</p>
              <p><span className="text-zinc-500">Processed:</span> {formatDateTime(selected.processedAt)}</p>
              <p className="flex items-center gap-1"><span className="text-zinc-500">Signature:</span> {selected.signatureValid ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Invalid</Badge>}</p>
              <p className="flex items-center gap-1"><span className="text-zinc-500">Status:</span> <StatusBadge status={selected.status} /> · {selected.attempts} attempt(s)</p>
            </div>
            {selected.error && <Alert tone="danger">{selected.error}</Alert>}
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Payload</p>
              <Json value={selected.payload} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Email delivery ----------

function EmailsTab() {
  const logs = useQuery({ queryKey: ['ops-email-logs'], queryFn: opsApi.emailLogs });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = (logs.data ?? []).filter(
    (r) => (!status || r.status === status) && (!q || [r.to, r.templateKey, r.subject, r.error].some((v) => v?.toLowerCase().includes(q))),
  );
  return (
    <DataTable<EmailLog>
      rows={logs.data ? rows : undefined}
      loading={logs.isLoading}
      error={logs.error}
      onRetry={logs.refetch}
      rowKey={(r) => r.id}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search recipient, template, subject…"
      filters={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" aria-label="Status">
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </Select>
      }
      exportConfig={{ fileBase: 'email-delivery', title: 'Email delivery log' }}
      emptyTitle="No emails match"
      columns={[
        { id: 'time', header: 'Time', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>, value: (r) => r.createdAt, sortable: true },
        { id: 'to', header: 'To', cell: (r) => r.to, value: (r) => r.to, sortable: true },
        { id: 'template', header: 'Template', cell: (r) => <span className="font-mono text-xs">{r.templateKey}</span>, value: (r) => r.templateKey, sortable: true, hideOnMobile: true },
        { id: 'subject', header: 'Subject', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.subject}</span>, value: (r) => r.subject, hideOnMobile: true },
        { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status, sortable: true },
        { id: 'error', header: 'Error', cell: (r) => <span className="line-clamp-1 max-w-xs text-xs text-red-700 dark:text-red-300" title={r.error ?? undefined}>{r.error ?? ''}</span>, value: (r) => r.error, hideOnMobile: true },
      ]}
    />
  );
}

export function SystemHealthPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabId | null;
  const tab: TabId = raw && TAB_IDS.includes(raw) ? raw : 'overview';
  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="System health" description="Platform usage, scheduled jobs, failures, payment webhooks and email delivery." />
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'jobs', label: 'Scheduled jobs' },
          { id: 'failed', label: 'Failed jobs' },
          { id: 'webhooks', label: 'Payment webhooks' },
          { id: 'emails', label: 'Email delivery' },
        ]}
      />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'failed' && <FailedJobsTab />}
      {tab === 'webhooks' && <WebhooksTab />}
      {tab === 'emails' && <EmailsTab />}
    </div>
  );
}
