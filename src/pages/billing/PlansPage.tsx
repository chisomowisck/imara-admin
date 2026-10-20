import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Plus } from 'lucide-react';
import { plansApi, METRIC_LABELS, type Metric, type Plan, type PlanInput } from '@/api/billing';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, StatusBadge, Textarea } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, formatMoney } from '@/lib/format';

const METRICS: Metric[] = ['USERS', 'TRANSACTIONS_PER_MONTH', 'STORAGE_MB'];

function PlanForm({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const modules = useQuery({ queryKey: ['platform-modules'], queryFn: plansApi.modules });
  const v = plan?.currentVersion;
  const [form, setForm] = useState<PlanInput>({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    monthlyPrice: v?.monthlyPrice ?? 0,
    annualPrice: v?.annualPrice ?? 0,
    allowMonthly: v?.allowMonthly ?? true,
    allowAnnual: v?.allowAnnual ?? true,
    modules: v?.modules ?? [],
    limits: v?.limits ?? { USERS: 1, TRANSACTIONS_PER_MONTH: null, STORAGE_MB: null },
    isPublic: plan?.isPublic ?? true,
    sortOrder: plan?.sortOrder ?? 0,
    changeNote: '',
  });
  const save = useMutation({
    mutationFn: () => (plan ? plansApi.update(plan.id, form) : plansApi.create(form)),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(plan ? `Plan saved. Existing subscriptions get the changes from their next billing cycle.` : `Plan ${p.code} created`);
      onClose();
    },
    onError: toast.error,
  });
  const priceChanged = plan && (form.monthlyPrice !== v?.monthlyPrice || form.annualPrice !== v?.annualPrice);
  const toggleModule = (code: string) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(code) ? f.modules.filter((c) => c !== code) : [...f.modules, code] }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Plan code" hint="Generated automatically">
          <Input value={plan?.code ?? 'Auto (e.g. PL005)'} disabled />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Monthly price (MWK)" required>
          <Input type="number" min={0} step="0.01" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: Number(e.target.value) })} />
        </Field>
        <Field label="Annual price (MWK)" required>
          <Input type="number" min={0} step="0.01" value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent-600" checked={form.allowMonthly} onChange={(e) => setForm({ ...form, allowMonthly: e.target.checked })} /> Monthly billing</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent-600" checked={form.allowAnnual} onChange={(e) => setForm({ ...form, allowAnnual: e.target.checked })} /> Annual billing</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent-600" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Shown on the website</label>
      </div>
      <Field label="Module entitlements" hint="Core modules (dashboard, organisation, chart of accounts, general ledger) are always included.">
        <div className="grid gap-1.5 rounded-md border border-zinc-200 p-2 sm:grid-cols-2 dark:border-zinc-800">
          {modules.data?.filter((m) => m.isActive).map((m) => (
            <label key={m.code} className={`flex items-start gap-2 rounded p-1.5 text-[13px] ${m.isCore ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
              <input type="checkbox" className="mt-0.5 accent-accent-600" disabled={m.isCore} checked={m.isCore || form.modules.includes(m.code)} onChange={() => toggleModule(m.code)} />
              <span><span className="font-medium">{m.name}</span>{m.isCore && <Badge className="ml-1">Core</Badge>}<span className="block text-xs text-zinc-500">{m.description}</span></span>
            </label>
          ))}
        </div>
      </Field>
      <div>
        <p className="label">Limits</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {METRICS.map((m) => (
            <Field key={m} label={METRIC_LABELS[m]} hint="Empty = unlimited">
              <Input type="number" min={1} value={form.limits[m] ?? ''} placeholder="Unlimited" onChange={(e) => setForm({ ...form, limits: { ...form.limits, [m]: e.target.value === '' ? null : Number(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </div>
      {plan && (
        <>
          <Alert tone="info">Changes to prices, modules or limits create version {(v?.version ?? 0) + 1}. Existing subscriptions keep their current version until their next billing cycle.</Alert>
          <Field label="Change note" required={!!priceChanged} hint={priceChanged ? 'Price changes are logged as critical actions.' : undefined}>
            <Input value={form.changeNote} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} />
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!form.name || (!form.allowMonthly && !form.allowAnnual) || (!!priceChanged && !form.changeNote?.trim())}>
          {plan ? 'Save plan' : 'Create plan'}
        </Button>
      </div>
    </form>
  );
}

function Versions({ plan }: { plan: Plan }) {
  const versions = useQuery({ queryKey: ['plan-versions', plan.id], queryFn: () => plansApi.versions(plan.id) });
  return (
    <QueryState query={versions}>
      {(list) => (
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-zinc-500 uppercase"><tr><th className="py-1.5">Version</th><th>Monthly</th><th>Annual</th><th>Modules</th><th>Subscriptions</th><th>Created</th></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.map((v) => (
              <tr key={v.id}>
                <td className="py-1.5">v{v.version}{v.id === plan.currentVersion?.id && <Badge tone="accent" className="ml-1">Current</Badge>}<div className="text-xs text-zinc-500">{v.changeNote}</div></td>
                <td>{formatMoney(v.monthlyPrice)}</td>
                <td>{formatMoney(v.annualPrice)}</td>
                <td className="text-xs">{v.modules.map((m) => m.moduleCode).join(', ')}</td>
                <td>{v._count.subscriptions}</td>
                <td className="text-xs">{formatDateTime(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </QueryState>
  );
}

export function PlansPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const plans = useQuery({ queryKey: ['plans'], queryFn: plansApi.list });
  const modules = useQuery({ queryKey: ['platform-modules'], queryFn: plansApi.modules });
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [versionsOf, setVersionsOf] = useState<Plan | null>(null);
  const [statusChange, setStatusChange] = useState<Plan | null>(null);
  const toggle = useMutation({
    mutationFn: ({ plan, reason }: { plan: Plan; reason: string }) => (plan.status === 'ACTIVE' ? plansApi.deactivate(plan.id, reason) : plansApi.reactivate(plan.id, reason)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      setStatusChange(null);
      toast.success('Plan status updated');
    },
    onError: toast.error,
  });
  const moduleName = (code: string) => modules.data?.find((m) => m.code === code)?.name ?? code;

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Subscription plans, prices (MWK), module entitlements and limits."
        actions={can('plans.manage') && <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New plan</Button>}
      />
      <QueryState query={plans} isEmpty={(d) => d.length === 0}>
        {(list) => (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <Card key={p.id} className={p.status === 'INACTIVE' ? 'opacity-70' : undefined}
                title={<span className="flex items-center gap-2">{p.name}<code className="text-xs font-normal text-zinc-500">{p.code}</code></span>}
                actions={<><StatusBadge status={p.status} />{!p.isPublic && <Badge>Hidden</Badge>}</>}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold">{formatMoney(p.currentVersion?.monthlyPrice)}</span>
                  <span className="text-xs text-zinc-500">/ month</span>
                </div>
                <p className="text-xs text-zinc-500">{formatMoney(p.currentVersion?.annualPrice)} / year · v{p.currentVersion?.version}</p>
                {p.description && <p className="mt-2 text-[13px] text-zinc-600 dark:text-zinc-400">{p.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.currentVersion?.modules.map((m) => <Badge key={m} tone="accent">{moduleName(m)}</Badge>)}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {METRICS.map((m) => (
                    <div key={m}><dt className="text-zinc-500">{METRIC_LABELS[m]}</dt><dd className="font-medium">{p.currentVersion?.limits[m] ?? 'Unlimited'}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-zinc-500">{p.activeSubscriptions} active subscription(s)</p>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  {can('plans.manage') && p.code !== 'LEGACY' && <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>Edit</Button>}
                  <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setVersionsOf(p)}>Versions</Button>
                  {can('plans.manage') && p.code !== 'LEGACY' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatusChange(p)}>{p.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New plan' : `Edit ${editing?.name ?? ''}`} size="lg">
        {editing && <PlanForm plan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!versionsOf} onClose={() => setVersionsOf(null)} title={`${versionsOf?.name} — version history`} size="xl">
        {versionsOf && <Versions plan={versionsOf} />}
      </Modal>
      {statusChange && (
        <ReasonDialog
          open
          onClose={() => setStatusChange(null)}
          title={statusChange.status === 'ACTIVE' ? `Deactivate ${statusChange.name}` : `Reactivate ${statusChange.name}`}
          description={statusChange.status === 'ACTIVE' ? 'New clients can no longer subscribe. Existing subscriptions continue.' : 'The plan becomes available to new clients again.'}
          tone={statusChange.status === 'ACTIVE' ? 'warning' : 'primary'}
          confirmLabel={statusChange.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
          loading={toggle.isPending}
          onConfirm={(reason) => toggle.mutate({ plan: statusChange, reason })}
        />
      )}
    </div>
  );
}
