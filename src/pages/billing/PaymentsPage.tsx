import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoicesApi, type PaymentRow } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Field, Input, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, formatMoney, humanize } from '@/lib/format';

function RefundModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState<'ORIGINAL' | 'BANK_TRANSFER' | 'CASH'>(payment.gateway === 'MANUAL' ? 'BANK_TRANSFER' : 'ORIGINAL');
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => invoicesApi.refund(payment.id, { amount: Number(amount), method, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Refund recorded (logged as a critical action)');
      onClose();
    },
    onError: toast.error,
  });
  return (
    <Modal open onClose={onClose} title="Refund payment" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={run.isPending} disabled={!(Number(amount) > 0) || reason.trim().length < 3} onClick={() => run.mutate()}>Refund</Button></>}>
      <div className="space-y-3">
        <p className="text-[13px]">{payment.invoice?.number} · {humanize(payment.method)} · {formatMoney(payment.amount)}</p>
        <Field label="Amount (MWK)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Refund via" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {payment.gateway !== 'MANUAL' && <option value="ORIGINAL">Original payment method (gateway)</option>}
            <option value="BANK_TRANSFER">Bank transfer (recorded manually)</option>
            <option value="CASH">Cash (recorded manually)</option>
          </Select>
        </Field>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function PaymentsPage() {
  const { can, admin } = useAuth();
  const [tab, setTab] = useState<'payments' | 'attempts' | 'credit' | 'refunds'>('payments');
  const [page, setPage] = useState(1);
  const [attemptStatus, setAttemptStatus] = useState('');
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);
  const payments = useQuery({ queryKey: ['payments', page], queryFn: () => invoicesApi.payments({ page, limit: 25 }), enabled: tab === 'payments' });
  const attempts = useQuery({ queryKey: ['attempts', page, attemptStatus], queryFn: () => invoicesApi.attempts({ page, limit: 25, status: attemptStatus }), enabled: tab === 'attempts' });
  const credit = useQuery({ queryKey: ['credit-notes'], queryFn: () => invoicesApi.creditNotes(), enabled: tab === 'credit' });
  const refunds = useQuery({ queryKey: ['refunds'], queryFn: invoicesApi.refunds, enabled: tab === 'refunds' });

  return (
    <div>
      <PageHeader title="Payments" description="Money received through OneKhusa or recorded offline, collection attempts, credit notes and refunds." />
      <Alert tone="info">Payments currently run on the sandbox gateway until OneKhusa API access is available.</Alert>
      <div className="mt-4" />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ id: 'payments', label: 'Payments' }, { id: 'attempts', label: 'Collection attempts' }, { id: 'credit', label: 'Credit notes' }, { id: 'refunds', label: 'Refunds' }]} />
      {tab === 'payments' && (
        <DataTable
          rows={payments.data?.data}
          loading={payments.isLoading}
          error={payments.error}
          onRetry={payments.refetch}
          rowKey={(r) => r.id}
          pagination={payments.data?.meta}
          onPageChange={setPage}
          exportConfig={{ fileBase: 'payments', title: 'Payments', generatedBy: admin?.email }}
          columns={[
            { id: 'paid', header: 'Paid at', cell: (r) => formatDateTime(r.paidAt), value: (r) => r.paidAt, sortable: true },
            { id: 'inv', header: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.invoice?.number ?? '—'}</span>, value: (r) => r.invoice?.number },
            { id: 'org', header: 'Organisation', cell: (r) => r.invoice?.billToName ?? r.organizationId, value: (r) => r.invoice?.billToName },
            { id: 'method', header: 'Method', cell: (r) => <span>{humanize(r.method)} <span className="text-xs text-zinc-500">{r.gateway}</span></span>, value: (r) => r.method },
            { id: 'ref', header: 'Reference', cell: (r) => <span className="font-mono text-xs">{r.reference ?? '—'}</span>, value: (r) => r.reference, hideOnMobile: true },
            { id: 'amount', header: 'Amount', cell: (r) => <span className={r.kind === 'REFUND' ? 'text-red-600' : ''}>{formatMoney(r.amount)}{r.kind === 'REFUND' && <Badge tone="warning" className="ml-1">Refund</Badge>}</span>, value: (r) => r.amount, sortable: true, className: 'text-right' },
            { id: 'act', header: '', exportable: false, cell: (r) => (can('billing.refund') && r.kind === 'PAYMENT' ? <Button size="sm" variant="ghost" onClick={() => setRefunding(r)}>Refund</Button> : null) },
          ]}
          emptyTitle="No payments yet"
        />
      )}
      {tab === 'attempts' && (
        <DataTable
          rows={attempts.data?.data}
          loading={attempts.isLoading}
          error={attempts.error}
          onRetry={attempts.refetch}
          rowKey={(r) => r.id}
          pagination={attempts.data?.meta}
          onPageChange={setPage}
          filters={<Select value={attemptStatus} onChange={(e) => { setAttemptStatus(e.target.value); setPage(1); }} className="w-36" aria-label="Status"><option value="">All</option>{['PENDING', 'SUCCEEDED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</Select>}
          exportConfig={{ fileBase: 'payment-attempts', title: 'Payment attempts', generatedBy: admin?.email }}
          columns={[
            { id: 'at', header: 'Started', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt },
            { id: 'inv', header: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.invoice?.number}</span>, value: (r) => r.invoice?.number },
            { id: 'org', header: 'Organisation', cell: (r) => r.invoice?.billToName, value: (r) => r.invoice?.billToName },
            { id: 'who', header: 'Initiated by', cell: (r) => `${humanize(r.initiatedBy)} · #${r.attemptNumber}${r.dunningStage ? ` (stage ${r.dunningStage})` : ''}`, value: (r) => r.initiatedBy, hideOnMobile: true },
            { id: 'method', header: 'Method', cell: (r) => humanize(r.method), value: (r) => r.method },
            { id: 'amount', header: 'Amount', cell: (r) => formatMoney(r.amount), value: (r) => r.amount, className: 'text-right' },
            { id: 'status', header: 'Status', cell: (r) => <div><StatusBadge status={r.status} />{r.failureReason && <p className="text-xs text-zinc-500">{r.failureReason}</p>}</div>, value: (r) => r.status },
          ]}
        />
      )}
      {tab === 'credit' && (
        <DataTable rows={credit.data} loading={credit.isLoading} error={credit.error} onRetry={credit.refetch} rowKey={(r) => r.id} exportConfig={{ fileBase: 'credit-notes', title: 'Credit notes' }}
          columns={[
            { id: 'n', header: 'Credit note', cell: (r) => <span className="font-mono text-xs">{r.number}</span>, value: (r) => r.number },
            { id: 'inv', header: 'Invoice ID', cell: (r) => r.invoiceId, value: (r) => r.invoiceId },
            { id: 'amt', header: 'Amount', cell: (r) => formatMoney(r.amount), value: (r) => r.amount },
            { id: 'reason', header: 'Reason', cell: (r) => r.reason, value: (r) => r.reason },
            { id: 'at', header: 'Issued', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt },
          ]} emptyTitle="No credit notes" />
      )}
      {tab === 'refunds' && (
        <DataTable rows={refunds.data} loading={refunds.isLoading} error={refunds.error} onRetry={refunds.refetch} rowKey={(r) => r.id} exportConfig={{ fileBase: 'refunds', title: 'Refunds' }}
          columns={[
            { id: 'at', header: 'Date', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt },
            { id: 'p', header: 'Payment', cell: (r) => `#${r.paymentId}`, value: (r) => r.paymentId },
            { id: 'amt', header: 'Amount', cell: (r) => formatMoney(r.amount), value: (r) => r.amount },
            { id: 'm', header: 'Method', cell: (r) => humanize(r.method), value: (r) => r.method },
            { id: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
            { id: 'reason', header: 'Reason', cell: (r) => r.reason, value: (r) => r.reason },
          ]} emptyTitle="No refunds" />
      )}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
    </div>
  );
}
