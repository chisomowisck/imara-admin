import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Repeat } from 'lucide-react';
import { plansApi, subscriptionsApi, METRIC_LABELS, type Cycle, type TenantModule, type UsageFigure } from '@/api/billing';
import type { TenantDetail } from '@/api/tenants';
import { useAuth } from '@/auth/AuthContext';
import { DataTable } from '@/components/table/DataTable';
import { Alert, Badge, Button, Card, DescriptionList, Field, Input, Select, StatusBadge, Textarea } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime, formatMoney, humanize } from '@/lib/format';
import { tenantTabExtensions } from '../tenants/tenantTabExtensions';

export function UsageBars({ figures }: { figures: UsageFigure[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {figures.map((f) => {
        const pct = f.limit ? Math.min(100, Math.round((f.used / f.limit) * 100)) : 0;
        const color = f.state === 'OVER_LIMIT' || f.state === 'AT_LIMIT' ? 'bg-red-500' : f.state === 'NEAR_LIMIT' ? 'bg-amber-500' : 'bg-accent-500';
        return (
          <div key={f.metric} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{METRIC_LABELS[f.metric]}{f.estimated && ' (est.)'}</span>
              {f.state !== 'OK' && <Badge tone={f.state === 'NEAR_LIMIT' ? 'warning' : 'danger'}>{humanize(f.state)}</Badge>}
            </div>
            <p className="mt-1 text-lg font-semibold">{f.used.toLocaleString()} <span className="text-xs font-normal text-zinc-500">/ {f.limit ?? '∞'}</span></p>
            <div className="mt-2 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800"><div className={`h-1.5 rounded ${color}`} style={{ width: `${f.limit ? pct : 4}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function ModulesTab({ tenant }: { tenant: TenantDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const modules = useQuery({ queryKey: ['tenant', tenant.id, 'modules'], queryFn: () => subscriptionsApi.modules(tenant.id) });
  const [pending, setPending] = useState<{ module: TenantModule; enabled: boolean | null } | null>(null);
  const toggle = useMutation({
    mutationFn: (reason: string) => subscriptionsApi.toggleModule(tenant.id, pending!.module.code, pending!.enabled, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id, 'modules'] });
      toast.success('Module access updated. It takes effect immediately.');
      setPending(null);
    },
    onError: toast.error,
  });
  const canToggle = can('tenants.modules') && !['ARCHIVED', 'DELETED'].includes(tenant.status);
  return (
    <>
      <p className="mb-2 text-xs text-zinc-500">Toggles override the plan for this organisation only. Changes take effect immediately and are logged.</p>
      <DataTable
        rows={modules.data}
        loading={modules.isLoading}
        error={modules.error}
        onRetry={modules.refetch}
        rowKey={(r) => r.code}
        columns={[
          { id: 'name', header: 'Module', cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-zinc-500">{r.description}</p></div> },
          { id: 'plan', header: 'In plan', cell: (r) => (r.isCore ? <Badge>Core</Badge> : r.inPlan ? <Badge tone="success">Included</Badge> : <Badge>Not included</Badge>) },
          { id: 'override', header: 'Admin override', cell: (r) => (r.override === null ? <span className="text-zinc-400">—</span> : r.override ? <Badge tone="info">Forced on</Badge> : <Badge tone="warning">Forced off</Badge>) },
          { id: 'state', header: 'Access', cell: (r) => (r.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="danger">Disabled</Badge>) },
          {
            id: 'actions', header: '', className: 'text-right',
            cell: (r) => !r.isCore && canToggle && (
              <div className="flex justify-end gap-1">
                {r.enabled ? (
                  <Button size="sm" variant="secondary" onClick={() => setPending({ module: r, enabled: false })}>Turn off</Button>
                ) : (
                  <Button size="sm" onClick={() => setPending({ module: r, enabled: true })}>Turn on</Button>
                )}
                {r.override !== null && <Button size="sm" variant="ghost" onClick={() => setPending({ module: r, enabled: null })}>Follow plan</Button>}
              </div>
            ),
          },
        ]}
      />
      {pending && (
        <ReasonDialog
          open
          onClose={() => setPending(null)}
          title={`${pending.enabled === null ? 'Reset' : pending.enabled ? 'Enable' : 'Disable'} ${pending.module.name}`}
          description={pending.enabled === false ? 'Users of this organisation lose access to the module immediately.' : pending.enabled ? 'Users of this organisation get access immediately, regardless of their plan.' : 'Access will follow the organisation’s plan again.'}
          tone={pending.enabled === false ? 'danger' : 'primary'}
          confirmLabel="Apply"
          loading={toggle.isPending}
          onConfirm={(reason) => toggle.mutate(reason)}
        />
      )}
    </>
  );
}

function PlanChangeModal({ tenant, mode, onClose }: { tenant: TenantDetail; mode: 'assign' | 'change'; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ['plans'], queryFn: plansApi.list });
  const [planId, setPlanId] = useState<number | ''>('');
  const [cycle, setCycle] = useState<Cycle>('MONTHLY');
  const [trial, setTrial] = useState(false);
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () =>
      mode === 'assign'
        ? subscriptionsApi.assign(tenant.id, { planId: Number(planId), billingCycle: cycle, trial, reason })
        : subscriptionsApi.changePlan(tenant.id, { planId: Number(planId), billingCycle: cycle, reason }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(mode === 'assign' ? 'Plan assigned' : res.effective === 'IMMEDIATE' ? 'Plan changed (trial/legacy: effective now)' : `Plan change scheduled for ${formatDate(res.effectiveDate)}`);
      onClose();
    },
    onError: toast.error,
  });
  const selected = plans.data?.find((p) => p.id === planId);
  return (
    <Modal open onClose={onClose} title={mode === 'assign' ? 'Assign plan' : 'Change subscription plan'} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!planId || reason.trim().length < 3} loading={run.isPending} onClick={() => run.mutate()}>{mode === 'assign' ? 'Assign' : 'Change plan'}</Button>
      </>
    }>
      <div className="space-y-3">
        {mode === 'change' && <Alert tone="info">Per the PRD, plan changes take effect at the start of the next billing cycle. During a trial they apply immediately.</Alert>}
        <Field label="Plan" required>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select a plan…</option>
            {plans.data?.filter((p) => p.status === 'ACTIVE' || p.code === 'LEGACY').map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.currentVersion?.monthlyPrice)}/mo</option>
            ))}
          </Select>
        </Field>
        <Field label="Billing cycle" required>
          <Select value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)}>
            {(!selected || selected.currentVersion?.allowMonthly) && <option value="MONTHLY">Monthly</option>}
            {(!selected || selected.currentVersion?.allowAnnual) && <option value="ANNUAL">Annual</option>}
          </Select>
        </Field>
        {mode === 'assign' && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-accent-600" checked={trial} onChange={(e) => setTrial(e.target.checked)} /> Start with a free trial</label>}
        <Field label="Reason" required hint="Recorded in the audit trail.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExtendTrialModal({ tenant, currentEnd, onClose }: { tenant: TenantDetail; currentEnd: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => subscriptionsApi.extendTrial(tenant.id, { days, reason }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      toast.success(`Trial now ends ${formatDate(r.trialEndsAt)}. The client was emailed.`);
      onClose();
    },
    onError: toast.error,
  });
  const newEnd = new Date(new Date(currentEnd).getTime() + days * 86400000);
  return (
    <Modal open onClose={onClose} title="Extend trial" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={reason.trim().length < 3 || days < 1} loading={run.isPending} onClick={() => run.mutate()}>Extend trial</Button>
      </>
    }>
      <div className="space-y-3">
        <p className="text-[13px]">Current trial end: <b>{formatDate(currentEnd)}</b></p>
        <Field label="Extend by (days)" required>
          <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
        <p className="text-[13px]">New trial end: <b>{formatDate(newEnd)}</b></p>
        <Field label="Reason" required hint="Recorded in the audit trail; the client is notified by email.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function BillingTab({ tenant }: { tenant: TenantDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const sub = useQuery({ queryKey: ['tenant', tenant.id, 'subscription'], queryFn: () => subscriptionsApi.forTenant(tenant.id) });
  const usage = useQuery({ queryKey: ['tenant', tenant.id, 'usage'], queryFn: () => subscriptionsApi.usage(tenant.id) });
  const [modal, setModal] = useState<'assign' | 'change' | 'trial' | 'cancel' | 'reactivate' | null>(null);
  const simple = useMutation({
    mutationFn: ({ kind, reason }: { kind: 'cancel' | 'reactivate'; reason: string }) => (kind === 'cancel' ? subscriptionsApi.cancel(tenant.id, reason) : subscriptionsApi.reactivate(tenant.id, reason)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      setModal(null);
      toast.success('Subscription updated');
    },
    onError: toast.error,
  });
  const manage = can('subscriptions.manage') && !['ARCHIVED', 'DELETED'].includes(tenant.status);

  return (
    <QueryState query={sub}>
      {({ current, latest, events }) => {
        const s = current ?? latest;
        return (
          <div className="space-y-4">
            <Card
              title="Subscription"
              actions={
                manage && (
                  <>
                    {!current && <Button size="sm" onClick={() => setModal('assign')}>Assign plan</Button>}
                    {current && <Button size="sm" variant="secondary" icon={<Repeat className="size-3.5" />} onClick={() => setModal('change')}>Change plan</Button>}
                    {current?.status === 'TRIALING' && <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-3.5" />} onClick={() => setModal('trial')}>Extend trial</Button>}
                    {current && !current.cancelAtPeriodEnd && !current.isLegacy && <Button size="sm" variant="ghost" onClick={() => setModal('cancel')}>Cancel at period end</Button>}
                    {(!current && latest) || current?.cancelAtPeriodEnd ? <Button size="sm" variant="ghost" onClick={() => setModal('reactivate')}>Reactivate</Button> : null}
                  </>
                )
              }
            >
              {!s ? (
                <Alert tone="warning">This organisation has no subscription.</Alert>
              ) : (
                <>
                  {s.isLegacy && <div className="mb-3"><Alert tone="info">On the hidden Legacy plan (all modules, unlimited, not invoiced). Assign a real plan to start billing.</Alert></div>}
                  {s.cancelAtPeriodEnd && <div className="mb-3"><Alert tone="warning">Cancellation scheduled at the end of the current period.</Alert></div>}
                  {s.pendingPlanId && <div className="mb-3"><Alert tone="info">A plan change ({s.pendingBillingCycle?.toLowerCase()}) is scheduled for {formatDate(s.nextBillingDate)}.</Alert></div>}
                  <DescriptionList
                    items={[
                      { label: 'Plan', value: `${s.plan.name} (v${s.planVersion.version})` },
                      { label: 'Status', value: <StatusBadge status={s.status} /> },
                      { label: 'Billing cycle', value: humanize(s.billingCycle) },
                      { label: 'Price', value: formatMoney(s.billingCycle === 'ANNUAL' ? s.planVersion.annualPrice : s.planVersion.monthlyPrice) },
                      { label: 'Started', value: formatDate(s.startDate) },
                      { label: 'Trial ends', value: formatDate(s.trialEndsAt) },
                      { label: 'Current period', value: s.currentPeriodStart ? `${formatDate(s.currentPeriodStart)} – ${formatDate(s.currentPeriodEnd)}` : '—' },
                      { label: 'Next invoice date', value: formatDate(s.nextBillingDate) },
                      { label: 'Auto-renew', value: s.autoRenew ? `On (${humanize(s.paymentMethod)})` : 'Off (manual payment)' },
                      ...(((tenant as any).billingSummary as Record<string, unknown> | undefined)
                        ? [
                            { label: 'Last payment', value: formatDate((tenant as any).billingSummary.lastPaymentAt) },
                            { label: 'Outstanding balance', value: formatMoney((tenant as any).billingSummary.outstandingBalance) },
                          ]
                        : []),
                    ]}
                  />
                </>
              )}
            </Card>
            <Card title="Usage against limits">
              <QueryState query={usage}>{(figures) => <UsageBars figures={figures} />}</QueryState>
            </Card>
            {tenantTabExtensions.billingExtra && <tenantTabExtensions.billingExtra tenant={tenant} />}
            <Card title="Subscription history" padded={false}>
              <DataTable
                rows={events}
                rowKey={(r) => r.id}
                columns={[
                  { id: 'when', header: 'When', cell: (r) => formatDateTime(r.createdAt) },
                  { id: 'type', header: 'Event', cell: (r) => humanize(r.type) },
                  { id: 'details', header: 'Details', cell: (r) => <span className="font-mono text-xs">{r.details ? JSON.stringify(r.details) : ''}</span> },
                  { id: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—' },
                  { id: 'by', header: 'By', cell: (r) => r.actorEmail ?? r.actorType },
                ]}
                emptyTitle="No subscription events"
              />
            </Card>
            {(modal === 'assign' || modal === 'change') && <PlanChangeModal tenant={tenant} mode={modal} onClose={() => setModal(null)} />}
            {modal === 'trial' && current?.trialEndsAt && <ExtendTrialModal tenant={tenant} currentEnd={current.trialEndsAt} onClose={() => setModal(null)} />}
            {(modal === 'cancel' || modal === 'reactivate') && (
              <ReasonDialog
                open
                onClose={() => setModal(null)}
                title={modal === 'cancel' ? 'Cancel subscription at period end' : 'Reactivate subscription'}
                description={modal === 'cancel' ? 'The subscription ends at the end of the current billing period. No further invoices are generated.' : 'Restores the subscription on its previous plan.'}
                tone={modal === 'cancel' ? 'warning' : 'primary'}
                confirmLabel={modal === 'cancel' ? 'Schedule cancellation' : 'Reactivate'}
                loading={simple.isPending}
                onConfirm={(reason) => simple.mutate({ kind: modal, reason })}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

/** Header shortcut on the organisation page: Change plan (PRD action). */
function HeaderActions({ tenant }: { tenant: TenantDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!can('subscriptions.manage') || ['ARCHIVED', 'DELETED'].includes(tenant.status) || !tenant.subscriptionId) return null;
  return (
    <>
      <Button variant="secondary" icon={<Repeat className="size-4" />} onClick={() => setOpen(true)}>Change plan</Button>
      {open && <PlanChangeModal tenant={tenant} mode="change" onClose={() => setOpen(false)} />}
    </>
  );
}

tenantTabExtensions.modules = ModulesTab;
tenantTabExtensions.billing = BillingTab;
tenantTabExtensions.headerActions = HeaderActions;
