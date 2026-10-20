import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { auditApi, type AuditRow } from '@/api/admins';
import { Can } from '@/auth/guards';
import { DataTable } from '@/components/table/DataTable';
import { Badge, Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/lib/format';

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-zinc-400">—</span>;
  return <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 font-mono text-[11px] dark:bg-zinc-950">{JSON.stringify(value, null, 2)}</pre>;
}

export function AuditPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [critical, setCritical] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search);

  const filters = {
    search: debounced,
    action,
    critical: critical === '' ? undefined : critical,
    organizationId: organizationId || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  };
  const list = useQuery({ queryKey: ['platform-audit', page, filters], queryFn: () => auditApi.list({ ...filters, page, limit: 25 }) });
  const actions = useQuery({ queryKey: ['platform-audit-actions'], queryFn: auditApi.actions });

  const doExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      await auditApi.export({ ...filters, format });
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Immutable record of every platform admin action. Entries cannot be edited or deleted."
        actions={
          <Can all={['audit.export']}>
            {(['xlsx', 'pdf', 'csv'] as const).map((f) => (
              <Button key={f} size="sm" variant="secondary" icon={<Download className="size-3.5" />} loading={exporting} onClick={() => doExport(f)}>
                {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
              </Button>
            ))}
          </Can>
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
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search action, actor, entity, reason…"
        onRowClick={setSelected}
        filters={
          <>
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-48" aria-label="Action">
              <option value="">All actions</option>
              {actions.data?.map((a) => <option key={a}>{a}</option>)}
            </Select>
            <Select value={critical} onChange={(e) => { setCritical(e.target.value); setPage(1); }} className="w-36" aria-label="Critical">
              <option value="">All severities</option>
              <option value="true">Critical only</option>
              <option value="false">Non-critical</option>
            </Select>
            <Input value={organizationId} onChange={(e) => { setOrganizationId(e.target.value.replace(/\D/g, '')); setPage(1); }} placeholder="Org ID" className="w-24" aria-label="Organisation ID" />
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-36" aria-label="From" />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-36" aria-label="To" />
          </>
        }
        columns={[
          { id: 'time', header: 'Time', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
          { id: 'actor', header: 'Actor', cell: (r) => r.actorEmail ?? <Badge>{r.actorType}</Badge> },
          { id: 'action', header: 'Action', cell: (r) => <span className="inline-flex items-center gap-1 font-mono text-xs">{r.isCritical && <ShieldAlert className="size-3.5 text-amber-500" aria-label="Critical" />}{r.action}</span> },
          { id: 'org', header: 'Organisation', cell: (r) => r.organizationId ?? '—', hideOnMobile: true },
          { id: 'entity', header: 'Entity', cell: (r) => (r.entityType ? `${r.entityType} #${r.entityId ?? ''}` : '—'), hideOnMobile: true },
          { id: 'reason', header: 'Reason', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.reason ?? '—'}</span>, hideOnMobile: true },
          { id: 'ip', header: 'IP', cell: (r) => r.ipAddress ?? '—', hideOnMobile: true },
        ]}
      />
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.action ?? ''} size="lg">
        {selected && (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-zinc-500">When:</span> {formatDateTime(selected.createdAt)}</p>
              <p><span className="text-zinc-500">Actor:</span> {selected.actorEmail ?? selected.actorType}</p>
              <p><span className="text-zinc-500">Organisation:</span> {selected.organizationId ?? '—'}</p>
              <p><span className="text-zinc-500">Entity:</span> {selected.entityType} {selected.entityId}</p>
              <p><span className="text-zinc-500">IP:</span> {selected.ipAddress ?? '—'}</p>
              <p><span className="text-zinc-500">Critical:</span> {selected.isCritical ? 'Yes' : 'No'}</p>
            </div>
            {selected.reason && <p><span className="text-zinc-500">Reason:</span> {selected.reason}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Before</p><Json value={selected.before} /></div>
              <div><p className="mb-1 text-xs font-semibold text-zinc-500 uppercase">After</p><Json value={selected.after} /></div>
            </div>
            {selected.metadata != null && <div><p className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Metadata</p><Json value={selected.metadata} /></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
