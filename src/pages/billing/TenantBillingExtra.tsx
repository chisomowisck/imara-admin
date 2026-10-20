import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponsApi } from '@/api/platform';
import type { TenantDetail } from '@/api/tenants';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatMoney } from '@/lib/format';
import { tenantTabExtensions } from '@/pages/tenants/tenantTabExtensions';
import { InvoicesTable } from './InvoicesPage';

function DiscountsCard({ tenant }: { tenant: TenantDetail }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['discounts', tenant.id], queryFn: () => couponsApi.discounts(tenant.id) });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [f, setF] = useState({ description: '', discountType: 'PERCENT' as 'PERCENT' | 'FIXED', value: '10', cycles: '', reason: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['discounts', tenant.id] });
  const apply = useMutation({ mutationFn: () => couponsApi.apply(tenant.id, code.trim()), onSuccess: () => { refresh(); setCode(''); toast.success('Coupon applied to future invoices'); }, onError: toast.error });
  const add = useMutation({
    mutationFn: () => couponsApi.addDiscount(tenant.id, { description: f.description, discountType: f.discountType, value: Number(f.value), cycles: f.cycles ? Number(f.cycles) : undefined, reason: f.reason }),
    onSuccess: () => { refresh(); setAdding(false); toast.success('Discount added'); },
    onError: toast.error,
  });
  const remove = useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => couponsApi.removeDiscount(id, reason), onSuccess: () => { refresh(); setRemoving(null); toast.success('Discount removed'); }, onError: toast.error });
  const manage = can('billing.manage') || can('coupons.manage');

  return (
    <Card title="Discounts & coupons" padded={false} actions={manage ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add discount</Button> : undefined}>
      {manage && (
        <div className="flex gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <Input placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="max-w-48" />
          <Button size="sm" disabled={!code.trim()} loading={apply.isPending} onClick={() => apply.mutate()}>Apply coupon</Button>
        </div>
      )}
      <DataTable rows={list.data} loading={list.isLoading} error={list.error} rowKey={(r) => r.id}
        columns={[
          { id: 'd', header: 'Discount', cell: (r) => r.description, value: (r) => r.description },
          { id: 'v', header: 'Value', cell: (r) => (r.discountType === 'PERCENT' ? `${r.value}%` : formatMoney(r.value)), value: (r) => r.value },
          { id: 'c', header: 'Cycles left', cell: (r) => r.cyclesRemaining ?? 'Unlimited', value: (r) => r.cyclesRemaining },
          { id: 'at', header: 'Added', cell: (r) => formatDate(r.createdAt), value: (r) => r.createdAt },
          { id: 's', header: 'Status', cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Ended</Badge>), value: (r) => r.isActive },
          { id: 'a', header: '', exportable: false, cell: (r) => (manage && r.isActive ? <Button size="sm" variant="ghost" onClick={() => setRemoving(r.id)}>Remove</Button> : null) },
        ]} emptyTitle="No discounts" />
      <Modal open={adding} onClose={() => setAdding(false)} title="Add discount" size="sm" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button loading={add.isPending} disabled={!f.description.trim() || !(Number(f.value) > 0) || f.reason.trim().length < 3} onClick={() => add.mutate()}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="Description" required><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required><Select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value as 'PERCENT' | 'FIXED' })}><option value="PERCENT">Percent</option><option value="FIXED">Fixed (MWK)</option></Select></Field>
            <Field label="Value" required><Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          </div>
          <Field label="Billing cycles" hint="Empty = every invoice until removed"><Input type="number" min={1} value={f.cycles} onChange={(e) => setF({ ...f, cycles: e.target.value })} /></Field>
          <Field label="Reason" required><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        </div>
      </Modal>
      <ReasonDialog open={removing !== null} onClose={() => setRemoving(null)} title="Remove discount" onConfirm={(reason: string) => removing !== null && remove.mutate({ id: removing, reason })} loading={remove.isPending} />
    </Card>
  );
}

function TenantBillingExtra({ tenant }: { tenant: TenantDetail }) {
  return (
    <div className="space-y-4">
      <Card title="Invoices" padded={false}><InvoicesTable organizationId={tenant.id} compact /></Card>
      <DiscountsCard tenant={tenant} />
    </div>
  );
}

tenantTabExtensions.billingExtra = TenantBillingExtra;
