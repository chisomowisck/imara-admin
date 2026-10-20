import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, LogOut, Search, X } from 'lucide-react';
import { ApiError } from '@/api/client';
import { supportApi, type SupportSession } from '@/api/platform';
import { tenantsApi, type TenantRow } from '@/api/tenants';
import { DataTable, type Column } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, DescriptionList, Field, Input, PageHeader, StatusBadge, Tabs, Textarea, cn } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatDateTime, formatMoney, humanize, timeAgo } from '@/lib/format';

const STORAGE_KEY = 'imara-admin-support-session';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type ResourceId =
  | 'summary'
  | 'users'
  | 'chart-of-accounts'
  | 'trial-balance'
  | 'journals'
  | 'customers'
  | 'invoices'
  | 'vendors'
  | 'bills'
  | 'bank-accounts'
  | 'inventory-items'
  | 'audit-log';

const RESOURCES: { id: ResourceId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'users', label: 'Users' },
  { id: 'chart-of-accounts', label: 'Chart of accounts' },
  { id: 'trial-balance', label: 'Trial balance' },
  { id: 'journals', label: 'Journals' },
  { id: 'customers', label: 'Customers' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'bills', label: 'Bills' },
  { id: 'bank-accounts', label: 'Bank accounts' },
  { id: 'inventory-items', label: 'Inventory' },
  { id: 'audit-log', label: 'Audit log' },
];

const PAGED: ResourceId[] = ['journals', 'customers', 'invoices', 'vendors', 'bills', 'inventory-items', 'audit-log'];

function loadStored(): SupportSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SupportSession) : null;
  } catch {
    return null;
  }
}

function saveStored(s: SupportSession | null) {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

const isSessionGone = (e: unknown) => e instanceof ApiError && (e.code === 'SESSION_ENDED' || e.code === 'SESSION_NOT_FOUND');

// ---------- defensive cell helpers ----------

const dash = <span className="text-zinc-400">—</span>;
const text = (v: unknown): ReactNode => (v === null || v === undefined || v === '' ? dash : String(v));
const mono = (v: unknown): ReactNode => (v === null || v === undefined || v === '' ? dash : <span className="font-mono text-xs">{String(v)}</span>);
const money = (v: unknown, currency?: unknown): ReactNode => (v === null || v === undefined || v === '' ? dash : <span className="whitespace-nowrap tabular-nums">{formatMoney(Number(v), typeof currency === 'string' ? currency : 'MWK')}</span>);
const qty = (v: unknown): ReactNode => (v === null || v === undefined || v === '' ? dash : <span className="tabular-nums">{Number(v).toLocaleString()}</span>);
const date = (v: unknown): ReactNode => (v ? <span className="whitespace-nowrap">{formatDate(v as string)}</span> : dash);
const dateTime = (v: unknown): ReactNode => (v ? <span className="whitespace-nowrap">{formatDateTime(v as string)}</span> : dash);
const status = (v: unknown): ReactNode => <StatusBadge status={typeof v === 'string' ? v : v === true ? 'ACTIVE' : v === false ? 'INACTIVE' : null} />;
const plain = (v: unknown): string | number | null | undefined => (v === null || v === undefined ? v : typeof v === 'number' ? v : String(v));

function col(id: string, header: string, get: (r: Row) => unknown, render: (v: unknown, r: Row) => ReactNode = text, opts: Partial<Column<Row>> = {}): Column<Row> {
  return { id, header, cell: (r) => render(get(r), r), value: (r) => plain(get(r)), sortable: true, ...opts };
}

const memberName = (r: Row) => [r?.user?.firstName, r?.user?.lastName].filter(Boolean).join(' ') || null;

const COLUMNS: Partial<Record<ResourceId, Column<Row>[]>> = {
  users: [
    col('name', 'Name', memberName),
    col('email', 'Email', (r) => r?.user?.email),
    col('roles', 'Roles', (r) => (Array.isArray(r?.memberRoles) ? r.memberRoles.map((m: Row) => m?.role?.displayName).filter(Boolean).join(', ') : null) || null, text, { hideOnMobile: true }),
    col('memberStatus', 'Member status', (r) => r?.status, status),
    col('userStatus', 'User status', (r) => r?.user?.status, status, { hideOnMobile: true }),
    col('lastLogin', 'Last login', (r) => r?.user?.lastLoginAt, (v) => (v ? timeAgo(v as string) : dash), { hideOnMobile: true }),
    col('joined', 'Joined', (r) => r?.joinedAt, date, { hideOnMobile: true }),
  ],
  'chart-of-accounts': [
    col('code', 'Code', (r) => r?.accountCode, mono),
    col('name', 'Name', (r) => r?.name),
    col('category', 'Category', (r) => r?.category, (v) => text(v ? humanize(String(v)) : null)),
    col('normal', 'Normal balance', (r) => r?.normalBalance, text, { hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status, { hideOnMobile: true }),
    col('balance', 'Balance', (r) => r?.currentBalance, (v) => money(v), { className: 'text-right' }),
  ],
  'trial-balance': [
    col('code', 'Code', (r) => r?.accountCode, mono),
    col('name', 'Account', (r) => r?.name),
    col('category', 'Category', (r) => r?.category, (v) => text(v ? humanize(String(v)) : null), { hideOnMobile: true }),
    col('debit', 'Debit', (r) => r?.debit, (v) => (Number(v) ? money(v) : dash), { className: 'text-right' }),
    col('credit', 'Credit', (r) => r?.credit, (v) => (Number(v) ? money(v) : dash), { className: 'text-right' }),
  ],
  journals: [
    col('number', 'Journal #', (r) => r?.journalNumber, mono),
    col('date', 'Entry date', (r) => r?.entryDate, date),
    col('type', 'Type', (r) => r?.entryType, (v) => text(v ? humanize(String(v)) : null), { hideOnMobile: true }),
    col('description', 'Description', (r) => r?.description, (v) => <span className="line-clamp-1 max-w-xs">{text(v)}</span>),
    col('reference', 'Reference', (r) => r?.reference, text, { hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status),
    col('lines', 'Lines', (r) => (Array.isArray(r?.lines) ? r.lines.length : null), qty, { hideOnMobile: true }),
    col('amount', 'Debit total', (r) => (Array.isArray(r?.lines) ? r.lines.filter((l: Row) => l?.lineType === 'DEBIT').reduce((s: number, l: Row) => s + Number(l?.amount ?? 0), 0) : null), (v) => money(v), { hideOnMobile: true, className: 'text-right' }),
  ],
  customers: [
    col('code', 'Code', (r) => r?.customerCode, mono),
    col('name', 'Customer', (r) => r?.customerName ?? r?.name),
    col('company', 'Company', (r) => r?.companyName, text, { hideOnMobile: true }),
    col('email', 'Email', (r) => r?.email, text, { hideOnMobile: true }),
    col('phone', 'Phone', (r) => r?.phone, text, { hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status),
    col('balance', 'Balance', (r) => r?.currentBalance, (v) => money(v), { className: 'text-right' }),
  ],
  invoices: [
    col('number', 'Invoice #', (r) => r?.invoiceNumber ?? r?.number, mono),
    col('customer', 'Customer', (r) => r?.customer?.customerName ?? r?.customerName ?? r?.customerId, text, { hideOnMobile: true }),
    col('date', 'Date', (r) => r?.invoiceDate, date),
    col('due', 'Due', (r) => r?.dueDate, date, { hideOnMobile: true }),
    col('total', 'Total', (r) => r?.totalAmount ?? r?.total, (v, r) => money(v, r?.currency), { className: 'text-right' }),
    col('balance', 'Balance', (r) => r?.balanceAmount ?? r?.balance, (v, r) => money(v, r?.currency), { className: 'text-right', hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status),
  ],
  vendors: [
    col('code', 'Code', (r) => r?.vendorCode, mono),
    col('name', 'Vendor', (r) => r?.vendorName ?? r?.name),
    col('trading', 'Trading name', (r) => r?.tradingName, text, { hideOnMobile: true }),
    col('tpin', 'TPIN', (r) => r?.tpin, mono, { hideOnMobile: true }),
    col('email', 'Email', (r) => r?.emailAddress ?? r?.email, text, { hideOnMobile: true }),
    col('terms', 'Payment terms', (r) => r?.paymentTerms, text, { hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status),
  ],
  bills: [
    col('number', 'Bill #', (r) => r?.billNumber ?? r?.number, mono),
    col('vendor', 'Vendor', (r) => r?.vendor?.vendorName ?? r?.vendorName ?? r?.vendorId, text, { hideOnMobile: true }),
    col('date', 'Date', (r) => r?.billDate, date),
    col('due', 'Due', (r) => r?.dueDate, date, { hideOnMobile: true }),
    col('total', 'Total', (r) => r?.totalAmount ?? r?.total, (v, r) => money(v, r?.currency), { className: 'text-right' }),
    col('balance', 'Balance', (r) => r?.balanceAmount ?? r?.balance, (v, r) => money(v, r?.currency), { className: 'text-right', hideOnMobile: true }),
    col('status', 'Status', (r) => r?.status, status),
  ],
  'bank-accounts': [
    col('bank', 'Bank', (r) => r?.bankName),
    col('number', 'Account number', (r) => r?.accountNumber, mono),
    col('type', 'Type', (r) => r?.accountType, (v) => text(v ? humanize(String(v)) : null), { hideOnMobile: true }),
    col('branch', 'Branch', (r) => r?.branchName, text, { hideOnMobile: true }),
    col('active', 'Status', (r) => (r?.isActive === undefined ? r?.status : r.isActive ? 'ACTIVE' : 'INACTIVE'), status),
    col('balance', 'Balance', (r) => r?.currentBalance, (v, r) => money(v, r?.currency), { className: 'text-right' }),
  ],
  'inventory-items': [
    col('code', 'Item code', (r) => r?.itemCode, mono),
    col('name', 'Name', (r) => r?.name),
    col('type', 'Type', (r) => r?.type, (v) => text(v ? humanize(String(v)) : null), { hideOnMobile: true }),
    col('category', 'Category', (r) => r?.category, text, { hideOnMobile: true }),
    col('unit', 'Unit', (r) => r?.unit, text, { hideOnMobile: true }),
    col('stock', 'In stock', (r) => r?.currentStock ?? r?.quantityOnHand ?? r?.quantity, qty, { className: 'text-right' }),
    col('reorder', 'Reorder level', (r) => r?.reorderLevel, qty, { hideOnMobile: true, className: 'text-right' }),
    col('cost', 'Cost price', (r) => r?.costPrice, (v) => money(v), { hideOnMobile: true, className: 'text-right' }),
    col('price', 'Selling price', (r) => r?.sellingPrice, (v) => money(v), { hideOnMobile: true, className: 'text-right' }),
    col('active', 'Status', (r) => (r?.isActive === undefined ? r?.status : r.isActive ? 'ACTIVE' : 'INACTIVE'), status),
  ],
  'audit-log': [
    col('time', 'Time', (r) => r?.createdAt, dateTime),
    col('action', 'Action', (r) => r?.action, mono),
    col('entityType', 'Entity type', (r) => r?.entityType),
    col('entityId', 'Entity ID', (r) => r?.entityId, mono, { hideOnMobile: true }),
    col('actor', 'Actor user', (r) => r?.actorUserId, text, { hideOnMobile: true }),
    col('ip', 'IP', (r) => r?.ipAddress, text, { hideOnMobile: true }),
  ],
};

const rowKeyOf = (r: Row): string | number => r?.id ?? r?.accountCode ?? JSON.stringify(r);

// ---------- start card ----------

function StartSessionCard({ onStarted }: { onStarted: (s: SupportSession) => void }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const preselectId = Number(params.get('tenant')) || null;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState<Pick<TenantRow, 'id' | 'name' | 'orgCode' | 'status'> | null>(null);
  const [reason, setReason] = useState('');
  const debounced = useDebounce(search.trim());

  const preselect = useQuery({ queryKey: ['tenant', preselectId], queryFn: () => tenantsApi.get(preselectId!), enabled: !!preselectId && !tenant });
  useEffect(() => {
    if (preselect.data && !tenant) setTenant(preselect.data);
  }, [preselect.data, tenant]);

  const results = useQuery({ queryKey: ['support-tenant-search', debounced], queryFn: () => tenantsApi.list({ search: debounced, limit: 10 }), enabled: open && debounced.length > 0 });

  const start = useMutation({
    mutationFn: () => supportApi.start(tenant!.id, reason.trim()),
    onSuccess: (s) => {
      const next = new URLSearchParams(params);
      next.delete('tenant');
      setParams(next, { replace: true });
      toast.success(`Support session started for ${s.organization?.name ?? tenant?.name ?? 'tenant'}`);
      onStarted({ ...s, organization: s.organization ?? (tenant ? { id: tenant.id, name: tenant.name, status: tenant.status } : undefined) });
    },
    onError: toast.error,
  });

  const valid = !!tenant && reason.trim().length >= 5;

  return (
    <Card title="Start support session">
      <div className="space-y-4">
        <Field label="Tenant" required hint="Search by name or organisation ID. Archived tenants can be viewed.">
          {tenant ? (
            <div className="flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">
              <span className="text-[13px] font-medium">{tenant.name}</span>
              {tenant.orgCode && <span className="font-mono text-xs text-zinc-500">{tenant.orgCode}</span>}
              <StatusBadge status={tenant.status} />
              <button className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" aria-label="Change tenant" onClick={() => setTenant(null)}>
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={preselect.isLoading ? 'Loading tenant…' : 'Search tenants…'}
                className="pl-8"
                aria-label="Search tenants"
              />
              {open && debounced && (
                <div className="card absolute z-20 mt-1 max-h-72 w-full overflow-y-auto p-1 shadow-lg">
                  {results.isLoading ? (
                    <p className="px-2 py-1.5 text-[13px] text-zinc-500">Searching…</p>
                  ) : results.isError ? (
                    <p className="px-2 py-1.5 text-[13px] text-red-600">{results.error instanceof Error ? results.error.message : 'Search failed'}</p>
                  ) : !results.data?.data?.length ? (
                    <p className="px-2 py-1.5 text-[13px] text-zinc-500">No tenants match.</p>
                  ) : (
                    results.data.data.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={t.status === 'DELETED'}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTenant(t);
                          setSearch('');
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
                      >
                        <span className="font-medium">{t.name}</span>
                        {t.orgCode && <span className="font-mono text-xs text-zinc-500">{t.orgCode}</span>}
                        <span className="ml-auto">
                          <StatusBadge status={t.status} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {preselect.isError && <p className="mt-1 text-xs text-red-600">Could not load the tenant from the link. Search for it instead.</p>}
        </Field>
        <Field label="Reason" required hint="Minimum 5 characters. Recorded in the audit trail with every page you open." error={reason.length > 0 && reason.trim().length < 5 ? 'Please give a more detailed reason.' : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ticket #1234 — client reports trial balance does not balance" />
        </Field>
        <div className="flex justify-end">
          <Button icon={<Eye className="size-3.5" />} disabled={!valid} loading={start.isPending} onClick={() => start.mutate()}>
            Start session
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------- resource views ----------

function SummaryView({ data }: { data: Row }) {
  const org: Row = data?.organization ?? {};
  const counts: Row = data?.counts ?? {};
  const countItems: { key: string; label: string }[] = [
    { key: 'members', label: 'Members' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'journals', label: 'Journals' },
    { key: 'customers', label: 'Customers' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'bills', label: 'Bills' },
    { key: 'items', label: 'Inventory items' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {countItems.map((c) => (
          <div key={c.key} className="card p-3">
            <p className="text-xs text-zinc-500">{c.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts[c.key] != null ? Number(counts[c.key]).toLocaleString() : '—'}</p>
          </div>
        ))}
      </div>
      <Card title="Organisation">
        <DescriptionList
          items={[
            { label: 'Name', value: text(org.name) },
            { label: 'Organisation ID', value: mono(org.orgCode) },
            { label: 'Status', value: status(org.status) },
            { label: 'Type', value: text(org.type ? humanize(String(org.type)) : null) },
            { label: 'Category', value: text(org.orgCategoryCode) },
            { label: 'Industry', value: text(org.industry) },
            { label: 'TIN', value: text(org.tin) },
            { label: 'Email', value: text(org.email) },
            { label: 'Phone', value: text(org.phone) },
            { label: 'Country', value: text(org.country) },
            { label: 'Base currency', value: text(org.financialSettings?.baseCurrency ?? org.financialSettings?.currency) },
            { label: 'Fiscal year start', value: text(org.financialSettings?.fiscalYearStartMonth ?? org.financialSettings?.fiscalYearStart) },
            { label: 'Created', value: dateTime(org.createdAt) },
            { label: 'Last login', value: dateTime(org.lastLoginAt) },
          ]}
        />
      </Card>
    </div>
  );
}

function ResourceView({ session, resource, onSessionGone }: { session: SupportSession; resource: ResourceId; onSessionGone: () => void }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resource]);
  const paged = PAGED.includes(resource);
  const query = useQuery({
    queryKey: ['support-view', session.id, resource, paged ? page : 1],
    queryFn: () => supportApi.view<Row>(session.id, resource, paged ? page : 1),
    retry: (count, err) => !isSessionGone(err) && count < 1,
    staleTime: 30_000,
  });
  const goneHandled = useRef(false);
  useEffect(() => {
    if (!goneHandled.current && query.error && isSessionGone(query.error)) {
      goneHandled.current = true;
      onSessionGone();
    }
  }, [query.error, onSessionGone]);

  if (resource === 'summary') {
    return <QueryState query={query}>{(d) => <SummaryView data={d} />}</QueryState>;
  }

  const columns = COLUMNS[resource] ?? [];
  const label = RESOURCES.find((r) => r.id === resource)?.label ?? resource;
  const base = `support-${session.organizationId}-${resource}`;
  const title = `${session.organization?.name ?? `Organisation ${session.organizationId}`} — ${label}`;

  let rows: Row[] | undefined;
  let footer: ReactNode = null;
  if (query.data !== undefined) {
    const d = query.data as Row;
    if (resource === 'trial-balance') {
      rows = Array.isArray(d?.rows) ? d.rows : [];
      const balanced = Math.abs(Number(d?.totalDebit ?? 0) - Number(d?.totalCredit ?? 0)) < 0.005;
      footer = (
        <div className="card mt-3 flex flex-wrap items-center justify-end gap-4 px-4 py-2.5 text-[13px]">
          <span>
            Total debit <b className="tabular-nums">{formatMoney(d?.totalDebit ?? 0)}</b>
          </span>
          <span>
            Total credit <b className="tabular-nums">{formatMoney(d?.totalCredit ?? 0)}</b>
          </span>
          {balanced ? <Badge tone="success">Balanced</Badge> : <Badge tone="danger">Out of balance by {formatMoney(Math.abs(Number(d?.totalDebit ?? 0) - Number(d?.totalCredit ?? 0)))}</Badge>}
        </div>
      );
    } else if (paged) {
      rows = Array.isArray(d?.data) ? d.data : [];
    } else {
      rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    }
  }
  const meta = paged && query.data ? (query.data as Row)?.meta : undefined;
  const pagination = meta ? { page: Number(meta.page ?? page), limit: Number(meta.limit ?? 0), total: Number(meta.total ?? 0), totalPages: Math.max(1, Number(meta.totalPages ?? 1)) } : undefined;

  return (
    <>
      <DataTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(r) => rowKeyOf(r)}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        pagination={pagination}
        onPageChange={paged ? setPage : undefined}
        exportConfig={{ fileBase: base, title }}
        emptyTitle={`No ${label.toLowerCase()}`}
        emptyDescription="This tenant has no records of this type."
      />
      {footer}
      {paged && <p className="mt-2 text-[11px] text-zinc-500">Sorting and export apply to the current page only.</p>}
    </>
  );
}

// ---------- active session ----------

function ActiveSession({ session, onEnded }: { session: SupportSession; onEnded: (message?: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [resource, setResource] = useState<ResourceId>('summary');
  const summary = useQuery({
    queryKey: ['support-view', session.id, 'summary', 1],
    queryFn: () => supportApi.view<Row>(session.id, 'summary', 1),
    retry: (count, err) => !isSessionGone(err) && count < 1,
    staleTime: 30_000,
  });
  const org: Row = (summary.data as Row)?.organization ?? session.organization ?? {};
  const archived = (summary.data as Row)?.archived === true || org?.status === 'ARCHIVED';

  const end = useMutation({
    mutationFn: () => supportApi.end(session.id),
    onSuccess: () => onEnded('Support session ended.'),
    onError: (e) => {
      if (isSessionGone(e)) onEnded('Support session had already ended.');
      else toast.error(e);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['support-sessions'] }),
  });

  const handleGone = () => onEnded('This support session has ended. Start a new one with a reason.');

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Eye className="size-4 text-accent-600" />
            {org?.name ?? `Organisation ${session.organizationId}`}
            <StatusBadge status={org?.status} />
            {archived && <Badge tone="warning">Archived — read-only</Badge>}
          </span>
        }
        actions={
          <Button size="sm" variant="danger" icon={<LogOut className="size-3.5" />} loading={end.isPending} onClick={() => end.mutate()}>
            End session
          </Button>
        }
      >
        <DescriptionList
          items={[
            { label: 'Reason', value: session.reason },
            { label: 'Started', value: `${formatDateTime(session.startedAt)} (${timeAgo(session.startedAt)})` },
            { label: 'Expires', value: session.expiresAt ? formatDateTime(session.expiresAt) : '—' },
            { label: 'Session', value: <span className="font-mono">#{session.id}</span> },
            { label: 'Organisation ID', value: org?.orgCode ? <span className="font-mono">{org.orgCode}</span> : String(session.organizationId) },
          ]}
        />
      </Card>
      <div>
        <Tabs<ResourceId> tabs={RESOURCES} value={resource} onChange={setResource} />
        <ResourceView session={session} resource={resource} onSessionGone={handleGone} />
      </div>
    </div>
  );
}

// ---------- recent sessions ----------

function RecentSessions() {
  const sessions = useQuery({ queryKey: ['support-sessions'], queryFn: () => supportApi.sessions() });
  return (
    <Card title="Recent support sessions" padded={false}>
      <DataTable<SupportSession>
        rows={sessions.data}
        loading={sessions.isLoading}
        error={sessions.error}
        onRetry={sessions.refetch}
        rowKey={(r) => r.id}
        exportConfig={{ fileBase: 'support-sessions', title: 'Support sessions' }}
        emptyTitle="No support sessions yet"
        columns={[
          { id: 'admin', header: 'Admin', cell: (r) => r.adminEmail, value: (r) => r.adminEmail, sortable: true },
          { id: 'tenant', header: 'Tenant', cell: (r) => (r.organization?.name ? `${r.organization.name} (#${r.organizationId})` : `#${r.organizationId}`), value: (r) => r.organization?.name ?? r.organizationId, sortable: true },
          { id: 'reason', header: 'Reason', cell: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span>, value: (r) => r.reason },
          { id: 'started', header: 'Started', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.startedAt)}</span>, value: (r) => r.startedAt, sortable: true },
          { id: 'ended', header: 'Ended', cell: (r) => (r.endedAt ? <span className="whitespace-nowrap">{formatDateTime(r.endedAt)}</span> : <Badge tone="info">Open</Badge>), value: (r) => r.endedAt, sortable: true, hideOnMobile: true },
          {
            id: 'viewed',
            header: 'Resources viewed',
            cell: (r) =>
              r.resourcesViewed?.length ? (
                <div className="flex max-w-sm flex-wrap gap-1">
                  {r.resourcesViewed.map((v) => (
                    <Badge key={v}>{v}</Badge>
                  ))}
                </div>
              ) : (
                dash
              ),
            value: (r) => (r.resourcesViewed ?? []).join(', '),
            hideOnMobile: true,
          },
        ]}
      />
    </Card>
  );
}

// ---------- page ----------

export function SupportPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [session, setSessionState] = useState<SupportSession | null>(() => loadStored());

  const setSession = (s: SupportSession | null) => {
    saveStored(s);
    setSessionState(s);
  };

  const handleEnded = (message?: string) => {
    if (session) qc.removeQueries({ queryKey: ['support-view', session.id] });
    setSession(null);
    qc.invalidateQueries({ queryKey: ['support-sessions'] });
    if (message) toast.info(message);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Support view" description="Read-only access to a tenant's data for troubleshooting." />
      <Alert tone="warning" title="Read-only">
        Read-only. SmartTech never changes data inside a tenant. Every session and every page you open is logged in the audit trail.
      </Alert>
      <div className={cn(!session && 'max-w-2xl')}>
        {session ? (
          <ActiveSession key={session.id} session={session} onEnded={handleEnded} />
        ) : (
          <StartSessionCard
            onStarted={(s) => {
              setSession(s);
              qc.invalidateQueries({ queryKey: ['support-sessions'] });
            }}
          />
        )}
      </div>
      <RecentSessions />
    </div>
  );
}
