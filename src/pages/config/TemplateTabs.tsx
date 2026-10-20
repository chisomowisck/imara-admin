import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { configApi } from '@/api/platform';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea, cn } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { DataTable, type Column } from '@/components/table/DataTable';
import { formatDateTime } from '@/lib/format';

// ---------------- Chart of Accounts templates ----------------

type CoaRow = Awaited<ReturnType<typeof configApi.coaTemplates>>[number];
type AccountCategory = 'ASSETS' | 'LIABILITIES' | 'EQUITY' | 'INCOME' | 'EXPENSES';
const CATEGORIES: AccountCategory[] = ['ASSETS', 'LIABILITIES', 'EQUITY', 'INCOME', 'EXPENSES'];
const DEFAULT_BALANCE: Record<AccountCategory, 'DEBIT' | 'CREDIT'> = { ASSETS: 'DEBIT', EXPENSES: 'DEBIT', LIABILITIES: 'CREDIT', EQUITY: 'CREDIT', INCOME: 'CREDIT' };

interface AccountDraft {
  key: number;
  accountCode: string;
  name: string;
  category: AccountCategory;
  subCategory: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  description: string | null;
  isControlAccount: boolean;
  isBankAccount: boolean;
}

interface TemplateDraft {
  id?: number;
  code: string;
  name: string;
  description: string;
  orgCategoryCode: string;
  industryCode: string;
  isDefault: boolean;
  isActive: boolean;
  accounts: AccountDraft[];
}

let rowSeq = 1;
const newAccount = (category: AccountCategory = 'ASSETS'): AccountDraft => ({
  key: rowSeq++,
  accountCode: '',
  name: '',
  category,
  subCategory: '',
  normalBalance: DEFAULT_BALANCE[category],
  description: null,
  isControlAccount: false,
  isBankAccount: false,
});

function toDraft(t: any): TemplateDraft {
  return {
    id: t.id,
    code: t.code ?? '',
    name: t.name ?? '',
    description: t.description ?? '',
    orgCategoryCode: t.orgCategoryCode ?? '',
    industryCode: t.industryCode ?? '',
    isDefault: Boolean(t.isDefault),
    isActive: t.isActive !== false,
    accounts: (Array.isArray(t.accounts) ? t.accounts : []).map((a: any) => ({
      key: rowSeq++,
      accountCode: a.accountCode ?? '',
      name: a.name ?? '',
      category: (a.category ?? 'ASSETS') as AccountCategory,
      subCategory: a.subCategory ?? '',
      normalBalance: a.normalBalance === 'CREDIT' ? 'CREDIT' : 'DEBIT',
      description: a.description ?? null,
      isControlAccount: Boolean(a.isControlAccount),
      isBankAccount: Boolean(a.isBankAccount),
    })),
  };
}

function CoaEditor({ id, canEdit, onClose }: { id: number | null; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const full = useQuery({ queryKey: ['config-coa-template', id], queryFn: () => configApi.coaTemplate(id!), enabled: id !== null });
  const [draft, setDraft] = useState<TemplateDraft | null>(id === null ? { code: '', name: '', description: '', orgCategoryCode: '', industryCode: '', isDefault: false, isActive: true, accounts: [newAccount()] } : null);
  useEffect(() => {
    if (id !== null && full.data) setDraft(toDraft(full.data));
  }, [id, full.data]);

  const save = useMutation({
    mutationFn: (d: TemplateDraft) =>
      configApi.saveCoaTemplate({
        ...(d.id ? { id: d.id } : {}),
        code: d.code.trim(),
        name: d.name.trim(),
        description: d.description.trim() || undefined,
        orgCategoryCode: d.orgCategoryCode || null,
        industryCode: d.industryCode.trim() || null,
        isDefault: d.isDefault,
        isActive: d.isActive,
        accounts: d.accounts.map((a) => ({
          accountCode: a.accountCode.trim(),
          name: a.name.trim(),
          category: a.category,
          subCategory: a.subCategory.trim() || null,
          normalBalance: a.normalBalance,
          description: a.description,
          isControlAccount: a.isControlAccount,
          isBankAccount: a.isBankAccount,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-coa-templates'] });
      qc.invalidateQueries({ queryKey: ['config-coa-template'] });
      toast.success('Chart of Accounts template saved');
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const codes = draft?.accounts.map((a) => a.accountCode.trim()) ?? [];
  const duplicates = new Set(codes.filter((c, i) => c && codes.indexOf(c) !== i));
  const incomplete = draft?.accounts.some((a) => !a.accountCode.trim() || !a.name.trim());
  const valid = draft && draft.code.trim() && draft.name.trim() && draft.accounts.length > 0 && !incomplete && duplicates.size === 0;

  const setAccount = (key: number, patch: Partial<AccountDraft>) =>
    setDraft((d) => d && { ...d, accounts: d.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)) });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={id === null ? 'New Chart of Accounts template' : `Edit template ${draft?.code ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button disabled={!valid} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
              Save template
            </Button>
          )}
        </>
      }
    >
      {id !== null && full.isLoading ? (
        <LoadingState />
      ) : id !== null && full.isError ? (
        <ErrorState error={full.error} onRetry={() => full.refetch()} />
      ) : draft ? (
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code" required>
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="MSME_STD" />
            </Field>
            <Field label="Name" required className="lg:col-span-2">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Organisation category" hint="Match tenants of this category">
              <Select value={draft.orgCategoryCode} onChange={(e) => setDraft({ ...draft, orgCategoryCode: e.target.value })}>
                <option value="">None (any)</option>
                <option value="MSME">MSME</option>
                <option value="NGO">NGO</option>
                <option value="GOV">GOV</option>
              </Select>
            </Field>
            <Field label="Industry code" hint="Optional; matches the tenant's industry">
              <Input value={draft.industryCode} onChange={(e) => setDraft({ ...draft, industryCode: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-center gap-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-accent-600" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Default template
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-accent-600" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active
              </label>
            </div>
            <Field label="Description" className="sm:col-span-2 lg:col-span-3">
              <Textarea className="min-h-14" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">
                Accounts <span className="font-normal text-zinc-500">({draft.accounts.length})</span>
              </h3>
              {canEdit && (
                <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setDraft({ ...draft, accounts: [...draft.accounts, newAccount(draft.accounts[draft.accounts.length - 1]?.category)] })}>
                  Add row
                </Button>
              )}
            </div>
            {duplicates.size > 0 && (
              <div className="mb-2">
                <Alert tone="danger">Duplicate account codes: {[...duplicates].join(', ')}</Alert>
              </div>
            )}
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead className="bg-zinc-50 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:bg-zinc-900/60">
                  <tr>
                    <th className="w-28 px-2 py-2">Code</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="w-36 px-2 py-2">Category</th>
                    <th className="w-40 px-2 py-2">Sub-category</th>
                    <th className="w-28 px-2 py-2">Balance</th>
                    <th className="w-16 px-2 py-2 text-center" title="Control account">Control</th>
                    <th className="w-16 px-2 py-2 text-center" title="Bank account">Bank</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {draft.accounts.map((a) => (
                    <tr key={a.key}>
                      <td className="px-2 py-1">
                        <Input className={cn('h-8', duplicates.has(a.accountCode.trim()) && 'border-red-500')} value={a.accountCode} onChange={(e) => setAccount(a.key, { accountCode: e.target.value })} aria-label="Account code" />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8" value={a.name} onChange={(e) => setAccount(a.key, { name: e.target.value })} aria-label="Account name" />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          className="h-8"
                          value={a.category}
                          aria-label="Category"
                          onChange={(e) => {
                            const category = e.target.value as AccountCategory;
                            setAccount(a.key, { category, normalBalance: DEFAULT_BALANCE[category] });
                          }}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8" value={a.subCategory} onChange={(e) => setAccount(a.key, { subCategory: e.target.value })} aria-label="Sub-category" />
                      </td>
                      <td className="px-2 py-1">
                        <Select className="h-8" value={a.normalBalance} aria-label="Normal balance" onChange={(e) => setAccount(a.key, { normalBalance: e.target.value as 'DEBIT' | 'CREDIT' })}>
                          <option value="DEBIT">DEBIT</option>
                          <option value="CREDIT">CREDIT</option>
                        </Select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" className="accent-accent-600" checked={a.isControlAccount} aria-label="Control account" onChange={(e) => setAccount(a.key, { isControlAccount: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" className="accent-accent-600" checked={a.isBankAccount} aria-label="Bank account" onChange={(e) => setAccount(a.key, { isBankAccount: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                            aria-label="Remove row"
                            onClick={() => setDraft({ ...draft, accounts: draft.accounts.filter((x) => x.key !== a.key) })}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {draft.accounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                        A template needs at least one account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </fieldset>
      ) : (
        <LoadingState />
      )}
    </Modal>
  );
}

export function CoaTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const list = useQuery({ queryKey: ['config-coa-templates'], queryFn: configApi.coaTemplates });
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const columns: Column<CoaRow>[] = [
    {
      id: 'name',
      header: 'Name',
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {r.isDefault && (
            <Badge tone="accent" className="ml-1.5">
              Default
            </Badge>
          )}
          {r.description && <p className="text-xs text-zinc-500">{r.description}</p>}
        </div>
      ),
    },
    { id: 'code', header: 'Code', sortable: true, value: (r) => r.code, cell: (r) => <code className="text-xs">{r.code}</code> },
    { id: 'category', header: 'Org category', value: (r) => r.orgCategoryCode, cell: (r) => r.orgCategoryCode ?? <span className="text-zinc-400">Any</span> },
    { id: 'industry', header: 'Industry', value: (r) => r.industryCode, cell: (r) => r.industryCode ?? <span className="text-zinc-400">Any</span>, hideOnMobile: true },
    { id: 'accounts', header: 'Accounts', sortable: true, value: (r) => r._count.accounts, cell: (r) => r._count.accounts },
    { id: 'active', header: 'Status', value: (r) => r.isActive, cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(r.id)}>
          {canEdit ? 'Edit' : 'View'}
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <Alert tone="info">Applied automatically when a tenant is provisioned: matched by organisation category and industry, otherwise the default template.</Alert>
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        toolbar={
          canEdit && (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              New template
            </Button>
          )
        }
        emptyTitle="No templates"
        emptyDescription="Create a Chart of Accounts template to seed new tenants."
      />
      {editing !== null && <CoaEditor key={String(editing)} id={editing === 'new' ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------- Role templates ----------------

type RoleData = Awaited<ReturnType<typeof configApi.roleTemplates>>;
type RoleTemplate = RoleData['templates'][number];

const ACTIONS: { code: string; label: string }[] = [
  { code: 'V', label: 'View' },
  { code: 'C', label: 'Create' },
  { code: 'E', label: 'Edit' },
  { code: 'D', label: 'Delete' },
  { code: 'A', label: 'Approve' },
  { code: 'X', label: 'Export' },
  { code: 'F', label: 'Configure' },
];

/** Builds module -> action letter -> permission name from the permission catalogue. */
function buildMatrix(permissions: RoleData['permissions']) {
  const modules: string[] = [];
  const cells = new Map<string, Map<string, string>>();
  for (const p of permissions) {
    const letter = p.action && p.action.length === 1 ? p.action.toUpperCase() : (p.name.split('.').pop() ?? '').toUpperCase();
    const mod = p.module || p.name.split('.')[0];
    if (!cells.has(mod)) {
      cells.set(mod, new Map());
      modules.push(mod);
    }
    cells.get(mod)!.set(letter, p.name);
  }
  return { modules, cells };
}

function RoleEditor({ template, permissions, canEdit, onClose }: { template: RoleTemplate; permissions: RoleData['permissions']; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [granted, setGranted] = useState(() => new Set(template.permissions));
  const { modules, cells } = useMemo(() => buildMatrix(permissions), [permissions]);
  const descriptions = useMemo(() => new Map(permissions.map((p) => [p.name, p.description])), [permissions]);
  const save = useMutation({
    mutationFn: () => configApi.saveRoleTemplate(template.code, { name: name.trim(), description: description.trim() || undefined, permissions: [...granted].sort() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-role-templates'] });
      toast.success(`${name} role template saved`);
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const toggle = (perm: string) =>
    setGranted((g) => {
      const next = new Set(g);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  const toggleRow = (mod: string) => {
    const perms = [...(cells.get(mod)?.values() ?? [])];
    const all = perms.every((p) => granted.has(p));
    setGranted((g) => {
      const next = new Set(g);
      perms.forEach((p) => (all ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${canEdit ? 'Edit' : 'View'} role template — ${template.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button variant="warning" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
              Save role template
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">Changes apply to every organisation that uses this role and are logged as critical.</Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Code">
            <Input value={template.code} disabled />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea className="min-h-14" value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-zinc-50 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:bg-zinc-900/60">
              <tr>
                <th className="px-3 py-2 text-left">Module</th>
                {ACTIONS.map((a) => (
                  <th key={a.code} className="px-2 py-2 text-center" title={a.code}>
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {modules.map((mod) => (
                <tr key={mod} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-3 py-1.5">
                    {canEdit ? (
                      <button type="button" className="font-medium hover:underline" title="Toggle the whole row" onClick={() => toggleRow(mod)}>
                        {mod}
                      </button>
                    ) : (
                      <span className="font-medium">{mod}</span>
                    )}
                  </td>
                  {ACTIONS.map((a) => {
                    const perm = cells.get(mod)?.get(a.code);
                    return (
                      <td key={a.code} className="px-2 py-1.5 text-center">
                        {perm && (
                          <input
                            type="checkbox"
                            className="accent-accent-600"
                            checked={granted.has(perm)}
                            disabled={!canEdit}
                            title={descriptions.get(perm) ?? perm}
                            aria-label={`${mod} ${a.label}`}
                            onChange={() => toggle(perm)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">{granted.size} permission(s) granted.</p>
      </div>
    </Modal>
  );
}

export function RoleTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const roles = useQuery({ queryKey: ['config-role-templates'], queryFn: configApi.roleTemplates });
  const [editing, setEditing] = useState<RoleTemplate | null>(null);
  return (
    <div className="space-y-3">
      <Alert tone="warning">Changes apply to every organisation that uses this role and are logged as critical.</Alert>
      <QueryState query={roles} isEmpty={(d) => d.templates.length === 0}>
        {(data) => (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.templates.map((t) => (
                <Card
                  key={t.id}
                  title={
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-accent-600" />
                      {t.name}
                    </span>
                  }
                  actions={t.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                >
                  <code className="text-xs text-zinc-500">{t.code}</code>
                  {t.description && <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">{t.description}</p>}
                  <p className="mt-3 text-[13px]">
                    <span className="font-semibold">{t.permissions.length}</span> <span className="text-zinc-500">of {data.permissions.length} permissions</span>
                  </p>
                  <p className="text-xs text-zinc-500">Updated {formatDateTime(t.updatedAt)}</p>
                  <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(t)}>
                      {canEdit ? 'Edit permissions' : 'View permissions'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            {editing && <RoleEditor key={editing.code} template={editing} permissions={data.permissions} canEdit={canEdit} onClose={() => setEditing(null)} />}
          </>
        )}
      </QueryState>
    </div>
  );
}

// ---------------- Modules ----------------

type ModuleRow = Awaited<ReturnType<typeof configApi.modules>>[number];

export function ModulesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const modules = useQuery({ queryKey: ['config-modules'], queryFn: configApi.modules });
  const [editing, setEditing] = useState<{ code: string; name: string; description: string; sortOrder: string; isActive: boolean; isCore: boolean } | null>(null);
  const save = useMutation({
    mutationFn: ({ code, body }: { code: string; body: { name?: string; description?: string; isActive?: boolean; sortOrder?: number } }) => configApi.saveModule(code, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-modules'] });
      qc.invalidateQueries({ queryKey: ['platform-modules'] });
      setEditing(null);
      toast.success('Module saved');
    },
    onError: (e) => toast.error(e),
  });

  const columns: Column<ModuleRow>[] = [
    { id: 'sort', header: '#', sortable: true, value: (r) => r.sortOrder, cell: (r) => <span className="text-zinc-500 tabular-nums">{r.sortOrder}</span>, className: 'w-12' },
    { id: 'code', header: 'Code', sortable: true, value: (r) => r.code, cell: (r) => <code className="text-xs">{r.code}</code> },
    {
      id: 'name',
      header: 'Name',
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {r.isCore && (
            <Badge className="ml-1.5" tone="accent">
              Core
            </Badge>
          )}
        </div>
      ),
    },
    { id: 'description', header: 'Description', cell: (r) => <span className="text-xs text-zinc-500">{r.description ?? '—'}</span>, hideOnMobile: true },
    {
      id: 'active',
      header: 'Active',
      value: (r) => r.isActive,
      cell: (r) => (
        <label className="inline-flex items-center gap-2" title={r.isCore ? 'Core modules cannot be deactivated' : undefined}>
          <input
            type="checkbox"
            className="accent-accent-600"
            checked={r.isActive}
            disabled={!canEdit || r.isCore || save.isPending}
            onChange={(e) => save.mutate({ code: r.code, body: { isActive: e.target.checked } })}
            aria-label={`${r.name} active`}
          />
          <span className="text-xs">{r.isActive ? 'On' : 'Off'}</span>
        </label>
      ),
    },
    ...(canEdit
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            cell: (r: ModuleRow) => (
              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing({ code: r.code, name: r.name, description: r.description ?? '', sortOrder: String(r.sortOrder), isActive: r.isActive, isCore: r.isCore })}>
                Edit
              </Button>
            ),
          } satisfies Column<ModuleRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <Alert tone="info">Deactivated modules are hidden from plans and tenants. Core modules are always available and cannot be deactivated.</Alert>
      <DataTable columns={columns} rows={modules.data} rowKey={(r) => r.code} loading={modules.isLoading} error={modules.error} onRetry={() => modules.refetch()} emptyTitle="No modules" />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit module ${editing?.code ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editing?.name.trim()}
              loading={save.isPending}
              onClick={() =>
                editing &&
                save.mutate({
                  code: editing.code,
                  body: { name: editing.name.trim(), description: editing.description.trim(), sortOrder: Number(editing.sortOrder) || 0, ...(editing.isCore ? {} : { isActive: editing.isActive }) },
                })
              }
            >
              Save module
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Sort order">
              <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <label className={cn('flex items-center gap-2 text-[13px] sm:col-span-2', editing.isCore && 'opacity-70')}>
              <input type="checkbox" className="accent-accent-600" checked={editing.isActive} disabled={editing.isCore} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active
              {editing.isCore && <Badge tone="accent">Core — always active</Badge>}
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
