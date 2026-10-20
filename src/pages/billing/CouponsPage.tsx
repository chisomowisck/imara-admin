import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { couponsApi, type Coupon } from '@/api/platform';
import { plansApi } from '@/api/billing';
import { DataTable } from '@/components/table/DataTable';
import { Badge, Button, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatMoney } from '@/lib/format';

function CouponForm({ coupon, onClose }: { coupon?: Coupon; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ['plans'], queryFn: plansApi.list });
  const [f, setF] = useState({
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    discountType: coupon?.discountType ?? 'PERCENT',
    value: String(coupon?.value ?? 10),
    duration: coupon?.duration ?? 'ONCE',
    durationCycles: String(coupon?.durationCycles ?? 3),
    planIds: coupon?.planIds ?? [],
    maxRedemptions: coupon?.maxRedemptions ? String(coupon.maxRedemptions) : '',
    validFrom: coupon?.validFrom?.slice(0, 10) ?? '',
    validUntil: coupon?.validUntil?.slice(0, 10) ?? '',
    isActive: coupon?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      couponsApi.save({
        id: coupon?.id,
        code: f.code,
        description: f.description || undefined,
        discountType: f.discountType as Coupon['discountType'],
        value: Number(f.value),
        duration: f.duration as Coupon['duration'],
        durationCycles: f.duration === 'REPEATING' ? Number(f.durationCycles) : undefined,
        planIds: f.planIds.length ? f.planIds : undefined,
        maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : undefined,
        validFrom: f.validFrom ? new Date(f.validFrom).toISOString() : undefined,
        validUntil: f.validUntil ? new Date(`${f.validUntil}T23:59:59`).toISOString() : undefined,
        isActive: f.isActive,
      } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Coupon saved');
      onClose();
    },
    onError: toast.error,
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} disabled={!!coupon} /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Type" required><Select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value as Coupon['discountType'] })}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (MWK)</option></Select></Field>
        <Field label={f.discountType === 'PERCENT' ? 'Percent off' : 'Amount off (MWK)'} required><Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Duration" required><Select value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value as Coupon['duration'] })}><option value="ONCE">First invoice only</option><option value="REPEATING">Several billing cycles</option><option value="FOREVER">Every invoice</option></Select></Field>
        {f.duration === 'REPEATING' && <Field label="Billing cycles" required><Input type="number" min={1} value={f.durationCycles} onChange={(e) => setF({ ...f, durationCycles: e.target.value })} /></Field>}
        <Field label="Max redemptions" hint="Empty = unlimited"><Input type="number" min={1} value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })} /></Field>
        <Field label="Valid from"><Input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
        <Field label="Valid until"><Input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
      </div>
      <Field label="Restrict to plans" hint="None selected = all plans">
        <div className="flex flex-wrap gap-3">
          {plans.data?.filter((p) => p.code !== 'LEGACY').map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.planIds.includes(p.id)} onChange={() => setF({ ...f, planIds: f.planIds.includes(p.id) ? f.planIds.filter((x) => x !== p.id) : [...f.planIds, p.id] })} />{p.name}</label>
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!f.code || !(Number(f.value) > 0)} onClick={() => save.mutate()}>Save coupon</Button></div>
    </div>
  );
}

export function CouponsPage() {
  const coupons = useQuery({ queryKey: ['coupons'], queryFn: couponsApi.list });
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  return (
    <div>
      <PageHeader title="Coupons & discounts" description="Coupon codes clients or admins can apply. Discounts are applied before VAT on future invoices." actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New coupon</Button>} />
      <DataTable
        rows={coupons.data}
        loading={coupons.isLoading}
        error={coupons.error}
        onRetry={coupons.refetch}
        rowKey={(r) => r.id}
        onRowClick={setEditing}
        exportConfig={{ fileBase: 'coupons', title: 'Coupons' }}
        columns={[
          { id: 'code', header: 'Code', cell: (r) => <span className="font-mono">{r.code}</span>, value: (r) => r.code, sortable: true },
          { id: 'value', header: 'Discount', cell: (r) => (r.discountType === 'PERCENT' ? `${r.value}%` : formatMoney(r.value)), value: (r) => r.value },
          { id: 'dur', header: 'Duration', cell: (r) => (r.duration === 'REPEATING' ? `${r.durationCycles} cycles` : r.duration === 'ONCE' ? 'First invoice' : 'Forever'), value: (r) => r.duration },
          { id: 'red', header: 'Redeemed', cell: (r) => `${r.redeemedCount}${r.maxRedemptions ? ` / ${r.maxRedemptions}` : ''}`, value: (r) => r.redeemedCount },
          { id: 'valid', header: 'Valid', cell: (r) => (r.validFrom || r.validUntil ? `${formatDate(r.validFrom)} – ${formatDate(r.validUntil)}` : 'Always'), hideOnMobile: true },
          { id: 'active', header: 'Status', cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>), value: (r) => r.isActive },
        ]}
        emptyTitle="No coupons yet"
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New coupon' : `Edit ${editing?.code ?? ''}`} size="lg">
        {editing && <CouponForm coupon={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
