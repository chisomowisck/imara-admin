import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  OFFBOARD_REASONS,
  REACTIVATE_REASONS,
  SUSPEND_REASONS,
  tenantsApi,
  type TenantAction,
} from '@/api/tenants';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';

export interface TenantRef {
  id: number;
  name: string;
}

export const ACTION_PERMISSIONS: Record<TenantAction, string> = {
  SUSPEND: 'tenants.suspend',
  REACTIVATE: 'tenants.reactivate',
  OFFBOARD: 'tenants.offboard',
  RESTORE: 'tenants.restore',
  PURGE: 'tenants.purge',
};

export const ACTION_LABELS: Record<TenantAction, string> = {
  SUSPEND: 'Suspend',
  REACTIVATE: 'Reactivate',
  OFFBOARD: 'Offboard',
  RESTORE: 'Restore archived tenant',
  PURGE: 'Permanently delete data',
};

/** Two-step confirmation driven by the backend preview (consequences + confirmation token). */
function TwoStepActionModal({ tenant, action, onClose, onDone }: { tenant: TenantRef; action: 'OFFBOARD' | 'RESTORE' | 'PURGE'; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const preview = useQuery({
    queryKey: ['tenant-preview', tenant.id, action],
    queryFn: () => tenantsApi.preview(tenant.id, action.toLowerCase() as 'offboard' | 'restore' | 'purge'),
    gcTime: 0,
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [preset, setPreset] = useState('');
  const [details, setDetails] = useState('');
  const [typed, setTyped] = useState('');
  const reason = [preset, details.trim()].filter(Boolean).join(preset && details.trim() ? ': ' : '');
  const phrase = action === 'PURGE' ? tenant.name : action === 'OFFBOARD' ? 'OFFBOARD' : 'RESTORE';

  const run = useMutation({
    mutationFn: async () => {
      const token = preview.data?.confirmationToken ?? '';
      if (action === 'OFFBOARD') return tenantsApi.offboard(tenant.id, reason, token);
      if (action === 'RESTORE') return tenantsApi.restore(tenant.id, reason, token);
      return tenantsApi.purge(tenant.id, reason, token, typed);
    },
    onSuccess: () => {
      toast.success(action === 'OFFBOARD' ? 'Organisation offboarded and archived' : action === 'RESTORE' ? 'Organisation restored to Active' : 'Organisation data permanently deleted');
      onDone();
    },
    onError: toast.error,
  });

  const titles = { OFFBOARD: 'Offboard organisation', RESTORE: 'Restore archived organisation', PURGE: 'Permanently delete organisation data' };
  const ok = reason.trim().length >= 3 && typed.trim() === phrase;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`${titles[action]} — step ${step} of 2`}
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" disabled={!preview.data?.allowed} onClick={() => setStep(2)}>Continue</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button variant="danger" disabled={!ok} loading={run.isPending} onClick={() => run.mutate()}>{ACTION_LABELS[action]}</Button>
          </>
        )
      }
    >
      {preview.isLoading ? (
        <p className="text-[13px] text-zinc-500">Checking what will happen…</p>
      ) : preview.isError ? (
        <Alert tone="danger">{(preview.error as Error).message}</Alert>
      ) : preview.data && step === 1 ? (
        <div className="space-y-3 text-[13px]">
          <p>
            <b>{preview.data.organization.name}</b> <span className="text-zinc-500">({preview.data.organization.orgCode})</span> — currently {preview.data.organization.status.toLowerCase()}.
          </p>
          {!preview.data.allowed && <Alert tone="warning">{preview.data.reasonIfNot}</Alert>}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" /> What will happen</p>
            <ul className="list-disc space-y-1 pl-5">
              {preview.data.consequences.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          {action === 'OFFBOARD' && preview.data.archiveEndDate && (
            <p>Archive expiry date: <b>{formatDate(preview.data.archiveEndDate)}</b></p>
          )}
          {action === 'PURGE' && preview.data.purge && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <tbody>
                  {preview.data.purge.tables.map((t) => (
                    <tr key={t.table} className="border-b border-zinc-100 dark:border-zinc-800"><td className="px-2 py-1 font-mono">{t.table}</td><td className="px-2 py-1 text-right">{t.rows.toLocaleString()}</td></tr>
                  ))}
                  <tr><td className="px-2 py-1 font-semibold">Total rows</td><td className="px-2 py-1 text-right font-semibold">{preview.data.purge.totalRows.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {action !== 'PURGE' && (
            <Field label="Reason" required>
              <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="">Select a reason…</option>
                {(action === 'OFFBOARD' ? OFFBOARD_REASONS : ['Client requested reactivation — new subscription initiated', 'Archived in error', 'Legal / regulatory request']).map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
          )}
          <Field label={action === 'PURGE' ? 'Reason' : 'Details'} required={action === 'PURGE'} hint="Recorded in status history and the audit trail.">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Field label={`Type "${phrase}" to confirm`} required>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          {(action === 'RESTORE' || action === 'PURGE') && <Alert tone="warning">This is logged as a critical action.</Alert>}
        </div>
      )}
    </Modal>
  );
}

/** Hook that renders every tenant lifecycle dialog and exposes an `open(action, tenant)` launcher. */
export function useTenantActions(onChanged?: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<{ action: TenantAction; tenant: TenantRef } | null>(null);

  const done = () => {
    setPending(null);
    qc.invalidateQueries({ queryKey: ['tenants'] });
    qc.invalidateQueries({ queryKey: ['tenant'] });
    onChanged?.();
  };

  const simple = useMutation({
    mutationFn: ({ action, id, reason }: { action: 'SUSPEND' | 'REACTIVATE'; id: number; reason: string }) =>
      action === 'SUSPEND' ? tenantsApi.suspend(id, reason) : tenantsApi.reactivate(id, reason),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'SUSPEND' ? 'Organisation suspended. All user sessions were ended.' : 'Organisation reactivated');
      done();
    },
    onError: toast.error,
  });

  const dialogs = pending ? (
    pending.action === 'SUSPEND' || pending.action === 'REACTIVATE' ? (
      <ReasonDialog
        open
        onClose={() => setPending(null)}
        title={pending.action === 'SUSPEND' ? `Suspend ${pending.tenant.name}` : `Reactivate ${pending.tenant.name}`}
        description={
          pending.action === 'SUSPEND'
            ? 'All users are signed out immediately and see "Your account has been suspended. Please contact support." The primary contact is notified by email.'
            : 'Users can sign in again. A reactivation confirmation is sent to the primary contact.'
        }
        presetReasons={pending.action === 'SUSPEND' ? SUSPEND_REASONS : REACTIVATE_REASONS}
        confirmLabel={pending.action === 'SUSPEND' ? 'Suspend' : 'Reactivate'}
        tone={pending.action === 'SUSPEND' ? 'danger' : 'primary'}
        loading={simple.isPending}
        onConfirm={(reason) => simple.mutate({ action: pending.action as 'SUSPEND' | 'REACTIVATE', id: pending.tenant.id, reason })}
      />
    ) : (
      <TwoStepActionModal tenant={pending.tenant} action={pending.action} onClose={() => setPending(null)} onDone={done} />
    )
  ) : null;

  return { open: (action: TenantAction, tenant: TenantRef) => setPending({ action, tenant }), dialogs };
}
