import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { invoicesApi, type InvoiceRow } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, DescriptionList, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatDateTime, formatMoney, humanize } from '@/lib/format';

type Action = 'cancel' | 'manual' | 'credit' | 'extend' | null;

export function InvoiceDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => invoicesApi.get(id) });
  const [action, setAction] = useState<Action>(null);
  const [form, setForm] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '', paidAt: new Date().toISOString().slice(0, 10), notes: '', reason: '', dueDate: '' });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['invoice', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['tenant'] });
  };
  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      refresh();
      setAction(null);
      toast.success('Done');
    },
    onError: toast.error,
  });
  const open = (a: Action, balance?: number) => {
    setForm((f) => ({ ...f, amount: balance ? String(balance) : '', reason: '', reference: '', notes: '' }));
    setAction(a);
  };

  return (
    <QueryState query={inv}>
      {(i) => {
        const payable = i.status === 'ISSUED' || i.status === 'OVERDUE';
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={i.status} />
              {i.dunning && !i.dunning.resolvedAt && <Badge tone="warning">Dunning stage {i.dunning.stage}</Badge>}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => invoicesApi.pdf(i.id).catch(toast.error)}>PDF</Button>
                {can('billing.manage') && i.status !== 'CANCELLED' && <Button size="sm" variant="secondary" onClick={() => run.mutate(() => invoicesApi.resend(i.id))}>Email again</Button>}
                {can('billing.manage') && payable && <Button size="sm" onClick={() => open('manual', i.balance)}>Record payment</Button>}
                {can('billing.manage') && payable && <Button size="sm" variant="secondary" onClick={() => run.mutate(async () => { const r = await invoicesApi.retry(i.id); if (!r.started) throw new Error(r.reason ?? 'Could not start a retry'); })}>Retry charge</Button>}
                {can('billing.manage') && payable && <Button size="sm" variant="secondary" onClick={() => open('extend')}>Extend due date</Button>}
                {can('billing.refund') && i.status !== 'CANCELLED' && i.total - i.creditedTotal > 0 && <Button size="sm" variant="secondary" onClick={() => open('credit')}>Credit note</Button>}
                {can('billing.manage') && payable && i.amountPaid === 0 && <Button size="sm" variant="danger" onClick={() => setAction('cancel')}>Cancel</Button>}
              </div>
            </div>
            <DescriptionList
              items={[
                { label: 'Organisation', value: i.billToName },
                { label: 'Plan', value: `${i.planName} (${humanize(i.billingCycle)})` },
                { label: 'Period', value: `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}` },
                { label: 'Invoice date', value: formatDate(i.invoiceDate) },
                { label: 'Due date', value: formatDate(i.dueDate) },
                { label: 'Emailed', value: formatDateTime(i.emailedAt) },
              ]}
            />
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs text-zinc-500 uppercase"><tr><th className="py-1">Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {i.lines.map((l) => <tr key={l.id}><td className="py-1.5">{l.description}</td><td className="text-right">{formatMoney(l.amount)}</td></tr>)}
                <tr><td className="py-1.5 text-right text-zinc-500">Amount (excl. VAT)</td><td className="text-right">{formatMoney(i.subtotal - i.discountTotal)}</td></tr>
                <tr><td className="py-1.5 text-right text-zinc-500">VAT ({i.vatRate}%)</td><td className="text-right">{formatMoney(i.vatAmount)}</td></tr>
                <tr className="font-semibold"><td className="py-1.5 text-right">Total</td><td className="text-right">{formatMoney(i.total)}</td></tr>
                <tr><td className="py-1.5 text-right text-zinc-500">Paid / credited</td><td className="text-right">{formatMoney(i.amountPaid + i.creditedTotal)}</td></tr>
                <tr className="font-semibold"><td className="py-1.5 text-right">Balance</td><td className="text-right">{formatMoney(i.balance)}</td></tr>
              </tbody>
            </table>
            {i.cancelReason && <Alert tone="warning" title="Cancelled">{i.cancelReason}</Alert>}
            <div>
              <h3 className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Payments</h3>
              {i.payments.length ? i.payments.map((p) => <p key={p.id} className="text-[13px]">{formatDateTime(p.paidAt)} · {humanize(p.method)} · {p.reference ?? '—'} · <b>{formatMoney(p.amount)}</b>{p.kind === 'REFUND' && <Badge tone="warning" className="ml-1">Refund</Badge>}</p>) : <p className="text-[13px] text-zinc-500">No payments yet.</p>}
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Collection attempts</h3>
              {i.attempts.length ? (
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {i.attempts.map((a) => (
                      <tr key={a.id}><td className="py-1">{formatDateTime(a.createdAt)}</td><td>#{a.attemptNumber}{a.dunningStage ? ` (stage ${a.dunningStage})` : ''}</td><td>{humanize(a.method)} via {a.gateway}</td><td><StatusBadge status={a.status} /></td><td className="text-zinc-500">{a.failureReason}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-[13px] text-zinc-500">No attempts.</p>}
            </div>
            <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>

            <ReasonDialog open={action === 'cancel'} onClose={() => setAction(null)} title={`Cancel ${i.number}`} description="The invoice is voided and any dunning stops." confirmLabel="Cancel invoice" loading={run.isPending} onConfirm={(reason) => run.mutate(() => invoicesApi.cancel(i.id, reason))} />
            <Modal open={action === 'manual'} onClose={() => setAction(null)} title="Record offline payment" size="sm" footer={
              <><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button loading={run.isPending} disabled={!(Number(form.amount) > 0)} onClick={() => run.mutate(() => invoicesApi.manualPayment(i.id, { amount: Number(form.amount), method: form.method as 'BANK_TRANSFER' | 'CASH', reference: form.reference || undefined, paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined, notes: form.notes || undefined }))}>Record payment</Button></>
            }>
              <div className="space-y-3">
                <Field label="Amount (MWK)" required hint={`Balance ${formatMoney(i.balance)}`}><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Method" required><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option></Select></Field>
                <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. bank transaction ID" /></Field>
                <Field label="Paid on"><Input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></Field>
                <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                <p className="text-xs text-zinc-500">A confirmation is emailed to the client. A tenant suspended for non-payment is reactivated automatically once nothing is overdue.</p>
              </div>
            </Modal>
            <Modal open={action === 'credit'} onClose={() => setAction(null)} title="Issue credit note" size="sm" footer={
              <><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button loading={run.isPending} disabled={!(Number(form.amount) > 0) || form.reason.trim().length < 3} onClick={() => run.mutate(() => invoicesApi.creditNote(i.id, Number(form.amount), form.reason))}>Issue credit note</Button></>
            }>
              <div className="space-y-3">
                <Field label="Amount (MWK)" required hint={`Up to ${formatMoney(i.total - i.creditedTotal)}`}><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Reason" required><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
              </div>
            </Modal>
            <Modal open={action === 'extend'} onClose={() => setAction(null)} title="Extend due date" size="sm" footer={
              <><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button loading={run.isPending} disabled={!form.dueDate || form.reason.trim().length < 3} onClick={() => run.mutate(async () => { const r = await invoicesApi.extendDue(i.id, new Date(form.dueDate).toISOString(), form.reason); if (!r.updated) throw new Error(r.reason); })}>Extend</Button></>
            }>
              <div className="space-y-3">
                <p className="text-[13px]">Current due date: <b>{formatDate(i.dueDate)}</b></p>
                <Field label="New due date" required><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
                <Field label="Reason" required><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
              </div>
            </Modal>
          </div>
        );
      }}
    </QueryState>
  );
}

export function InvoicesTable({ organizationId, compact }: { organizationId?: number; compact?: boolean }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(compact ? '' : params.get('status') ?? '');
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const debounced = useDebounce(search);
  const q = { page, limit: compact ? 10 : 25, search: debounced, status, organizationId };
  const list = useQuery({ queryKey: ['invoices', q], queryFn: () => invoicesApi.list(q) });
  return (
    <>
      <DataTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        rowKey={(r) => r.id}
        pagination={list.data?.meta}
        onPageChange={setPage}
        search={compact ? undefined : search}
        onSearchChange={compact ? undefined : (v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Invoice number or organisation…"
        onRowClick={setViewing}
        filters={
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); if (!compact) setParams(e.target.value ? { status: e.target.value } : {}, { replace: true }); }} className="w-36" aria-label="Status">
            <option value="">All statuses</option>
            {['ISSUED', 'OVERDUE', 'PAID', 'CANCELLED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        }
        toolbar={!compact && (['xlsx', 'pdf', 'csv'] as const).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => invoicesApi.export({ ...q, page: undefined, limit: undefined, format: f }).catch(toast.error)}>{f === 'xlsx' ? 'Excel' : f.toUpperCase()}</Button>)}
        columns={[
          { id: 'number', header: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.number}</span>, value: (r) => r.number, sortable: true },
          ...(compact ? [] : [{ id: 'org', header: 'Organisation', cell: (r: InvoiceRow) => r.billToName, value: (r: InvoiceRow) => r.billToName, sortable: true }]),
          { id: 'period', header: 'Period', cell: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}`, hideOnMobile: true },
          { id: 'due', header: 'Due', cell: (r) => formatDate(r.dueDate), value: (r) => r.dueDate, sortable: true },
          { id: 'total', header: 'Total', cell: (r) => formatMoney(r.total), value: (r) => r.total, sortable: true, className: 'text-right' },
          { id: 'balance', header: 'Balance', cell: (r) => formatMoney(r.balance), value: (r) => r.balance, className: 'text-right', hideOnMobile: true },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status, sortable: true },
        ]}
        emptyTitle="No invoices"
      />
      {!compact && list.data && <p className="mt-2 text-xs text-zinc-500">Matching invoices total {formatMoney(list.data.meta.sumTotal)} · paid {formatMoney(list.data.meta.sumPaid)}</p>}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.number ?? ''} size="lg">
        {viewing && <InvoiceDetail id={viewing.id} onClose={() => setViewing(null)} />}
      </Modal>
    </>
  );
}

export function InvoicesPage() {
  return (
    <div>
      <PageHeader title="Invoices" description="Subscription invoices (INV-YYYY-00001), generated automatically each billing cycle." />
      <InvoicesTable />
    </div>
  );
}
