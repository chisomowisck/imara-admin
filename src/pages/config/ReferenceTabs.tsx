import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { configApi } from '@/api/platform';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { DataTable, type Column } from '@/components/table/DataTable';
import { formatDate } from '@/lib/format';

type TaxRule = Awaited<ReturnType<typeof configApi.taxRules>>[number];
type RefItem = Awaited<ReturnType<typeof configApi.reference>>[number];
type RateRow = Awaited<ReturnType<typeof configApi.rates>>['history'][number];

const today = () => new Date().toISOString().slice(0, 10);

// ---------------- Tax rules ----------------

interface TaxRuleDraft {
  id?: number;
  countryCode: string;
  taxType: string;
  name: string;
  rate: string;
  effectiveFrom: string;
  isActive: boolean;
  notes: string;
}

export function TaxRulesCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useQuery({ queryKey: ['config-tax-rules'], queryFn: configApi.taxRules });
  const [editing, setEditing] = useState<TaxRuleDraft | null>(null);
  const save = useMutation({
    mutationFn: (d: TaxRuleDraft) =>
      configApi.saveTaxRule({
        ...(d.id ? { id: d.id } : {}),
        countryCode: d.countryCode.trim().toUpperCase(),
        taxType: d.taxType.trim().toUpperCase(),
        name: d.name.trim(),
        rate: Number(d.rate),
        effectiveFrom: d.effectiveFrom,
        isActive: d.isActive,
        notes: d.notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-tax-rules'] });
      setEditing(null);
      toast.success('Tax rule saved');
    },
    onError: (e) => toast.error(e),
  });

  const columns: Column<TaxRule>[] = [
    { id: 'country', header: 'Country', cell: (r) => <code className="text-xs">{r.countryCode}</code>, value: (r) => r.countryCode, sortable: true },
    { id: 'type', header: 'Type', cell: (r) => r.taxType, value: (r) => r.taxType, sortable: true },
    { id: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span>, value: (r) => r.name },
    { id: 'rate', header: 'Rate', cell: (r) => `${Number(r.rate)}%`, value: (r) => Number(r.rate), sortable: true },
    { id: 'from', header: 'Effective from', cell: (r) => formatDate(r.effectiveFrom), value: (r) => r.effectiveFrom, sortable: true, hideOnMobile: true },
    { id: 'active', header: 'Status', cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>), value: (r) => r.isActive },
    { id: 'notes', header: 'Notes', cell: (r) => <span className="text-xs text-zinc-500">{r.notes ?? '—'}</span>, hideOnMobile: true },
    ...(canEdit
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            cell: (r: TaxRule) => (
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil className="size-3.5" />}
                onClick={() =>
                  setEditing({ id: r.id, countryCode: r.countryCode, taxType: r.taxType, name: r.name, rate: String(r.rate), effectiveFrom: String(r.effectiveFrom).slice(0, 10), isActive: r.isActive, notes: r.notes ?? '' })
                }
              >
                Edit
              </Button>
            ),
          } satisfies Column<TaxRule>,
        ]
      : []),
  ];

  const valid = editing && editing.countryCode.trim() && editing.taxType.trim() && editing.name.trim() && editing.rate !== '' && Number.isFinite(Number(editing.rate)) && editing.effectiveFrom;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tax rules</h3>
        {canEdit && (
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ countryCode: 'MW', taxType: 'VAT', name: '', rate: '16.5', effectiveFrom: today(), isActive: true, notes: '' })}>
            Add rule
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rules.data}
        rowKey={(r) => r.id}
        loading={rules.isLoading}
        error={rules.error}
        onRetry={() => rules.refetch()}
        emptyTitle="No tax rules yet"
        emptyDescription="Add a rule per country and tax type (for example MW / VAT 16.5%)."
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit tax rule' : 'New tax rule'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={!valid} loading={save.isPending} onClick={() => editing && save.mutate(editing)}>
              Save rule
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Country code" required hint="ISO 3166 alpha-2, e.g. MW">
              <Input value={editing.countryCode} maxLength={3} onChange={(e) => setEditing({ ...editing, countryCode: e.target.value })} />
            </Field>
            <Field label="Tax type" required hint="e.g. VAT, WHT">
              <Input value={editing.taxType} onChange={(e) => setEditing({ ...editing, taxType: e.target.value })} />
            </Field>
            <Field label="Name" required className="sm:col-span-2">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Value Added Tax" />
            </Field>
            <Field label="Rate (%)" required>
              <Input type="number" step="0.01" min={0} max={100} value={editing.rate} onChange={(e) => setEditing({ ...editing, rate: e.target.value })} />
            </Field>
            <Field label="Effective from" required>
              <Input type="date" value={editing.effectiveFrom} onChange={(e) => setEditing({ ...editing, effectiveFrom: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
              <input type="checkbox" className="accent-accent-600" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active
            </label>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------- Reference data ----------------

const REFERENCE_TYPES = [
  { value: 'COUNTRY', label: 'Countries' },
  { value: 'CURRENCY', label: 'Currencies' },
  { value: 'INDUSTRY', label: 'Industries' },
  { value: 'ORG_CATEGORY', label: 'Organisation categories' },
  { value: 'UNIT', label: 'Units of measure' },
  { value: 'PAYMENT_TERM', label: 'Payment terms' },
];

interface RefDraft {
  isNew: boolean;
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
  meta: string;
}

const isBase = (type: string, code: string) => type === 'CURRENCY' && code.toUpperCase() === 'MWK';

export function ReferenceDataTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState('COUNTRY');
  const [search, setSearch] = useState('');
  const items = useQuery({ queryKey: ['config-reference', type], queryFn: () => configApi.reference(type) });
  const [editing, setEditing] = useState<RefDraft | null>(null);

  let metaError: string | undefined;
  let parsedMeta: Record<string, unknown> | undefined;
  if (editing && editing.meta.trim()) {
    try {
      const v = JSON.parse(editing.meta);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) metaError = 'Meta must be a JSON object, e.g. {"symbol": "K"}';
      else parsedMeta = v;
    } catch (e) {
      metaError = `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`;
    }
  }

  const save = useMutation({
    mutationFn: (d: RefDraft) =>
      configApi.saveReference(type, {
        code: d.code.trim(),
        name: d.name.trim(),
        sortOrder: d.sortOrder === '' ? 0 : Number(d.sortOrder),
        isActive: d.isActive,
        meta: parsedMeta ?? {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-reference', type] });
      setEditing(null);
      toast.success('Reference item saved');
    },
    onError: (e) => toast.error(e),
  });

  const q = search.trim().toLowerCase();
  const rows = items.data?.filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));

  const columns: Column<RefItem>[] = [
    {
      id: 'code',
      header: 'Code',
      sortable: true,
      value: (r) => r.code,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <code className="text-xs">{r.code}</code>
          {isBase(type, r.code) && <Badge tone="accent">Base</Badge>}
        </span>
      ),
    },
    { id: 'name', header: 'Name', sortable: true, value: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: 'sort', header: 'Sort order', sortable: true, value: (r) => r.sortOrder, cell: (r) => r.sortOrder, hideOnMobile: true },
    { id: 'active', header: 'Status', value: (r) => r.isActive, cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
    ...(canEdit
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            cell: (r: RefItem) => (
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil className="size-3.5" />}
                onClick={() => setEditing({ isNew: false, code: r.code, name: r.name, sortOrder: String(r.sortOrder), isActive: r.isActive, meta: r.meta && Object.keys(r.meta).length ? JSON.stringify(r.meta, null, 2) : '' })}
              >
                Edit
              </Button>
            ),
          } satisfies Column<RefItem>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <Alert tone="info">Reference lists feed dropdowns in the tenant application. MWK is the base currency and cannot be deactivated.</Alert>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={items.isLoading}
        error={items.error}
        onRetry={() => items.refetch()}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search code or name…"
        filters={
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Reference type" className="w-56">
            {REFERENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        }
        toolbar={
          canEdit && (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ isNew: true, code: '', name: '', sortOrder: String((items.data?.length ?? 0) * 10), isActive: true, meta: '' })}>
              Add item
            </Button>
          )
        }
        emptyTitle="No items"
        emptyDescription="Add the first item to this list."
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? `New ${REFERENCE_TYPES.find((t) => t.value === type)?.label.toLowerCase()} item` : `Edit ${editing?.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={!editing?.code.trim() || !editing?.name.trim() || !!metaError} loading={save.isPending} onClick={() => editing && save.mutate(editing)}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required hint={editing.isNew ? 'Unique within the list; cannot be changed later.' : 'Codes cannot be changed.'}>
              <Input value={editing.code} disabled={!editing.isNew} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </Field>
            <Field label="Sort order">
              <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />
            </Field>
            <Field label="Name" required className="sm:col-span-2">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="accent-accent-600"
                  checked={editing.isActive}
                  disabled={isBase(type, editing.code) && editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                Active
                {isBase(type, editing.code) && <Badge tone="accent">Base currency — always active</Badge>}
              </label>
            </div>
            <Field label="Meta (JSON)" error={metaError} hint='Optional extra attributes, e.g. {"symbol": "K", "decimals": 2}' className="sm:col-span-2">
              <Textarea className="min-h-28 font-mono text-xs" value={editing.meta} spellCheck={false} onChange={(e) => setEditing({ ...editing, meta: e.target.value })} placeholder="{}" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------- Exchange rates ----------------

export function ExchangeRatesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const rates = useQuery({ queryKey: ['config-rates'], queryFn: configApi.rates });
  const currencies = useQuery({ queryKey: ['config-reference', 'CURRENCY'], queryFn: () => configApi.reference('CURRENCY'), enabled: canEdit });
  const [form, setForm] = useState<{ quoteCurrency: string; rate: string; effectiveDate: string; source: string } | null>(null);
  const add = useMutation({
    mutationFn: (f: NonNullable<typeof form>) => configApi.addRate({ quoteCurrency: f.quoteCurrency.trim().toUpperCase(), rate: Number(f.rate), effectiveDate: f.effectiveDate, source: f.source.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-rates'] });
      setForm(null);
      toast.success('Exchange rate added');
    },
    onError: (e) => toast.error(e),
  });

  const columns: Column<RateRow>[] = [
    { id: 'date', header: 'Effective date', sortable: true, value: (r) => r.effectiveDate, cell: (r) => formatDate(r.effectiveDate) },
    { id: 'ccy', header: 'Currency', sortable: true, value: (r) => r.quoteCurrency, cell: (r) => <code className="text-xs">{r.quoteCurrency}</code> },
    { id: 'rate', header: 'MWK per 1 unit', sortable: true, value: (r) => Number(r.rate), cell: (r) => <span className="tabular-nums">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span> },
    { id: 'source', header: 'Source', value: (r) => r.source, cell: (r) => r.source ?? <span className="text-zinc-400">—</span>, hideOnMobile: true },
  ];
  const currencyOptions = currencies.data?.filter((c) => c.isActive && c.code !== 'MWK') ?? [];
  const valid = form && form.quoteCurrency.trim() && Number(form.rate) > 0 && form.effectiveDate;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-zinc-500">Rates are stored as MWK per 1 unit of the foreign currency. The latest rate on or before a date is used for conversions.</p>
        {canEdit && (
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setForm({ quoteCurrency: '', rate: '', effectiveDate: today(), source: '' })}>
            Add rate
          </Button>
        )}
      </div>
      <QueryState query={rates}>
        {(data) => (
          <div className="space-y-4">
            {data.latest.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {data.latest.map((r) => (
                  <div key={r.quoteCurrency} className="card p-3">
                    <p className="text-xs text-zinc-500">1 {r.quoteCurrency} =</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">
                      {Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-xs font-normal text-zinc-500">MWK</span>
                    </p>
                    <p className="text-[11px] text-zinc-500">since {formatDate(r.effectiveDate)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-center text-[13px] text-zinc-500">No exchange rates recorded yet.</p>
              </Card>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <DataTable columns={columns} rows={data.history} rowKey={(r) => r.id} emptyTitle="No rate history" />
            </div>
          </div>
        )}
      </QueryState>
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Add exchange rate"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={!valid} loading={add.isPending} onClick={() => form && add.mutate(form)}>
              Add rate
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label="Currency" required hint="ISO code of the foreign currency, e.g. USD">
              {currencyOptions.length ? (
                <Select value={form.quoteCurrency} onChange={(e) => setForm({ ...form, quoteCurrency: e.target.value })}>
                  <option value="">Select a currency…</option>
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={form.quoteCurrency} maxLength={3} onChange={(e) => setForm({ ...form, quoteCurrency: e.target.value })} placeholder="USD" />
              )}
            </Field>
            <Field label="Rate (MWK per 1 unit)" required>
              <Input type="number" min={0} step="0.000001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </Field>
            <Field label="Effective date" required>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </Field>
            <Field label="Source" hint="e.g. Reserve Bank of Malawi">
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
