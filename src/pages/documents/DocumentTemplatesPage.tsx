import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, History, Pencil, Plus, Send, Star, Undo2 } from 'lucide-react';
import { documentTemplatesApi, LAYOUT_LABELS, type DocumentGroup, type PlatformTemplate, type PlatformTemplateStatus, type TemplateLayout, type TemplateVersion } from '@/api/documents';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, Field, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/lib/format';

/** Version history with restore; shared by the list and the editor. */
export function VersionsModal({ templateId, name, onClose, onRestored }: { templateId: number | null; name?: string; onClose: () => void; onRestored?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [restoring, setRestoring] = useState<TemplateVersion | null>(null);
  const versions = useQuery({ queryKey: ['document-templates', templateId, 'versions'], queryFn: () => documentTemplatesApi.versions(templateId!), enabled: templateId !== null });
  const restore = useMutation({
    mutationFn: (v: TemplateVersion) => documentTemplatesApi.restore(templateId!, v.version),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success(`Restored — saved as version ${t.version}`);
      setRestoring(null);
      onRestored?.();
      onClose();
    },
    onError: toast.error,
  });
  return (
    <>
      <Modal open={templateId !== null} onClose={onClose} title={`Version history${name ? ` — ${name}` : ''}`} size="lg">
        <QueryState query={versions} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No versions yet" />}>
          {(list) => (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 py-2">
                  <span className="w-10 font-mono text-xs">v{v.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{v.changeNote || <span className="text-zinc-400">No change note</span>}</p>
                    <p className="text-xs text-zinc-500">{formatDateTime(v.createdAt)} · {LAYOUT_LABELS[v.snapshot?.layout] ?? v.snapshot?.layout} · {v.snapshot?.name}</p>
                  </div>
                  {i === 0 ? (
                    <Badge tone="accent">Current</Badge>
                  ) : (
                    can('config.manage') && <Button size="sm" variant="secondary" icon={<Undo2 className="size-3.5" />} onClick={() => setRestoring(v)}>Restore</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Modal>
      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={() => restoring && restore.mutate(restoring)}
        loading={restore.isPending}
        tone="primary"
        title={`Restore version ${restoring?.version ?? ''}?`}
        message="The template's design is replaced with this version and saved as a new version. History is kept."
        confirmLabel="Restore"
      />
    </>
  );
}

function NewTemplateModal({ open, onClose, types, layouts }: { open: boolean; onClose: () => void; types: { code: string; name: string; group: DocumentGroup }[]; layouts: TemplateLayout[] }) {
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [layout, setLayout] = useState<TemplateLayout>('CLASSIC');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New platform template"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!type} onClick={() => navigate(`/documents/new?type=${encodeURIComponent(type)}&layout=${layout}`)}>Open editor</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Document type" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Select a document type…</option>
            {(['Sales', 'Purchases', 'Platform'] as DocumentGroup[]).map((g) => (
              <optgroup key={g} label={g}>
                {types.filter((t) => t.group === g).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Layout" required hint="You can change the layout later in the editor.">
          <Select value={layout} onChange={(e) => setLayout(e.target.value as TemplateLayout)}>
            {layouts.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l] ?? l}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-zinc-500">New templates start as drafts. Publish them to make them visible to organisations.</p>
      </div>
    </Modal>
  );
}

type PendingAction = { kind: 'status'; template: PlatformTemplate; status: PlatformTemplateStatus } | { kind: 'default'; template: PlatformTemplate };

export function DocumentTemplatesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const manage = can('config.manage');
  const [group, setGroup] = useState<DocumentGroup | ''>('');
  const [status, setStatus] = useState<PlatformTemplateStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [versionsOf, setVersionsOf] = useState<PlatformTemplate | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const editor = useQuery({ queryKey: ['document-templates', 'editor'], queryFn: documentTemplatesApi.editor, staleTime: 5 * 60_000 });
  const templates = useQuery({ queryKey: ['document-templates', 'list', status], queryFn: () => documentTemplatesApi.list({ status: status || undefined }) });

  const act = useMutation({
    mutationFn: (a: PendingAction) => (a.kind === 'default' ? documentTemplatesApi.setDefault(a.template.id) : documentTemplatesApi.setStatus(a.template.id, a.status)),
    onSuccess: (_t, a) => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success(a.kind === 'default' ? 'Default template updated' : a.status === 'PUBLISHED' ? 'Template published' : a.status === 'ARCHIVED' ? 'Template archived' : 'Template moved back to draft');
      setPending(null);
    },
    onError: toast.error,
  });

  const types = useMemo(() => editor.data?.types ?? [], [editor.data]);
  const typeName = (code: string) => types.find((t) => t.code === code)?.name ?? code;
  const groups = useMemo(() => {
    const visibleTypes = types.filter((t) => !group || t.group === group);
    return visibleTypes
      .map((t) => ({ type: t, rows: (templates.data ?? []).filter((r) => r.documentType === t.code) }))
      .filter((g) => g.rows.length > 0);
  }, [types, templates.data, group]);

  const confirmText = (a: PendingAction) => {
    const n = a.template.name;
    if (a.kind === 'default') return { title: 'Set as platform default?', message: <>"{n}" becomes the default {typeName(a.template.documentType).toLowerCase()} template for organisations that have not chosen their own.</>, label: 'Set as default', tone: 'primary' as const };
    if (a.status === 'PUBLISHED') return { title: 'Publish template?', message: <>"{n}" will appear in every eligible organisation's template gallery.</>, label: 'Publish', tone: 'primary' as const };
    if (a.status === 'DRAFT') return { title: 'Unpublish template?', message: <>"{n}" is removed from organisations' galleries{a.template.isDefault ? ' and stops being the platform default' : ''}. Copies organisations already made are not affected.</>, label: 'Unpublish', tone: 'warning' as const };
    return { title: 'Archive template?', message: <>"{n}" is hidden from galleries{a.template.isDefault ? ' and stops being the platform default' : ''}. Copies organisations already made are not affected.</>, label: 'Archive', tone: 'danger' as const };
  };
  const confirm = pending ? confirmText(pending) : null;

  return (
    <div>
      <PageHeader
        title="Document templates"
        description="SmartTech print templates for invoices, receipts, purchase documents and subscription billing."
        actions={manage ? <Button icon={<Plus className="size-4" />} disabled={!editor.data} onClick={() => setCreating(true)}>New template</Button> : undefined}
      />
      <div className="mb-4">
        <Alert tone="info">
          Published templates appear in every organisation's template gallery (or only in the chosen category's), where organisations can copy them. Organisations' own templates are never edited from here.
        </Alert>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Group" className="w-44" value={group} onChange={(e) => setGroup(e.target.value as DocumentGroup | '')}>
          <option value="">All groups</option>
          <option value="Sales">Sales</option>
          <option value="Purchases">Purchases</option>
          <option value="Platform">Platform</option>
        </Select>
        <Select aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value as PlatformTemplateStatus | '')}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      <QueryState query={templates}>
        {() =>
          editor.isLoading ? null : groups.length === 0 ? (
            <div className="card">
              <EmptyState title="No templates match" description={manage ? 'Create a template to seed organisations\' galleries.' : undefined} />
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(({ type, rows }) => (
                <Card
                  key={type.code}
                  padded={false}
                  title={<span className="flex items-center gap-2">{type.name}<Badge>{type.group}</Badge>{!type.printable && <Badge tone="warning">Design only</Badge>}</span>}
                >
                  <DataTable
                    rows={rows}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => navigate(`/documents/${r.id}`)}
                    columns={[
                      { id: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span>, value: (r) => r.name, sortable: true },
                      { id: 'layout', header: 'Layout', cell: (r) => LAYOUT_LABELS[r.layout] ?? r.layout, value: (r) => r.layout },
                      { id: 'status', header: 'Status', cell: (r) => <span className="flex items-center gap-1"><StatusBadge status={r.status} />{r.isDefault && <Badge tone="accent"><Star className="size-3" /> Default</Badge>}</span>, value: (r) => r.status },
                      { id: 'audience', header: 'Audience', cell: (r) => r.orgCategoryCode ?? <span className="text-zinc-500">All</span>, value: (r) => r.orgCategoryCode ?? 'All', hideOnMobile: true },
                      { id: 'copies', header: 'Copies', cell: (r) => r.copies, value: (r) => r.copies, sortable: true, hideOnMobile: true },
                      { id: 'updated', header: 'Updated', cell: (r) => formatDate(r.updatedAt), value: (r) => r.updatedAt, sortable: true, hideOnMobile: true },
                      {
                        id: 'actions',
                        header: '',
                        className: 'text-right',
                        cell: (r) => (
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {manage && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => navigate(`/documents/${r.id}`)}>Edit</Button>}
                            {manage && r.status === 'DRAFT' && <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} onClick={() => setPending({ kind: 'status', template: r, status: 'PUBLISHED' })}>Publish</Button>}
                            {manage && r.status === 'PUBLISHED' && <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'status', template: r, status: 'DRAFT' })}>Unpublish</Button>}
                            {manage && r.status === 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'status', template: r, status: 'DRAFT' })}>Restore to draft</Button>}
                            {manage && r.status === 'PUBLISHED' && !r.isDefault && <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => setPending({ kind: 'default', template: r })}>Set as default</Button>}
                            {manage && r.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => setPending({ kind: 'status', template: r, status: 'ARCHIVED' })}>Archive</Button>}
                            <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setVersionsOf(r)}>Versions</Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>

      {editor.data && <NewTemplateModal open={creating} onClose={() => setCreating(false)} types={editor.data.types} layouts={editor.data.layouts} />}
      <VersionsModal templateId={versionsOf?.id ?? null} name={versionsOf?.name} onClose={() => setVersionsOf(null)} />
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        loading={act.isPending}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.label}
        tone={confirm?.tone}
      />
    </div>
  );
}
