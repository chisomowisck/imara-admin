import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, DescriptionList, Field, Input, PageHeader } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/table/DataTable';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { formatDateTime, timeAgo } from '@/lib/format';

function RecoveryCodes({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  return (
    <Modal open={!!codes} onClose={onClose} title="Save your recovery codes" size="sm" footer={<Button onClick={onClose}>I have saved them</Button>}>
      <Alert tone="warning">Each code works once if you lose access to your authenticator and email. They will not be shown again.</Alert>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px]">
        {codes?.map((c) => (
          <code key={c} className="rounded bg-zinc-100 px-2 py-1 text-center dark:bg-zinc-800">{c}</code>
        ))}
      </div>
      <Button variant="secondary" size="sm" className="mt-3" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(codes?.join('\n') ?? '')}>
        Copy all
      </Button>
    </Modal>
  );
}

function TotpSetup({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (codes: string[]) => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const setup = useQuery({ queryKey: ['totp-setup', open], queryFn: authApi.totpSetup, enabled: open, staleTime: Infinity, gcTime: 0 });
  const confirm = useMutation({
    mutationFn: () => authApi.totpConfirm(code),
    onSuccess: (res) => {
      toast.success('Authenticator app enabled');
      setCode('');
      onDone(res.recoveryCodes);
    },
    onError: toast.error,
  });
  return (
    <Modal open={open} onClose={onClose} title="Set up an authenticator app" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={code.length !== 6}>Verify and enable</Button>
      </>
    }>
      {setup.isLoading ? (
        <p className="text-[13px] text-zinc-500">Generating secret…</p>
      ) : setup.isError ? (
        <Alert tone="danger">{(setup.error as Error).message}</Alert>
      ) : setup.data ? (
        <div className="space-y-3 text-[13px]">
          <p>1. Scan this QR code with Google Authenticator, Microsoft Authenticator, Authy or similar.</p>
          <img src={setup.data.qrCodeDataUrl} alt="Authenticator QR code" className="mx-auto size-44 rounded border border-zinc-200 bg-white p-2" />
          <p className="text-xs text-zinc-500">Can't scan? Enter this key: <code className="font-mono break-all">{setup.data.manualKey}</code></p>
          <Field label="2. Enter the 6-digit code shown in the app" required>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} inputMode="numeric" className="text-center font-mono tracking-[0.4em]" />
          </Field>
        </div>
      ) : null}
    </Modal>
  );
}

export function AccountPage() {
  const { admin, refreshProfile } = useAuth();
  const toast = useToast();
  const [totpOpen, setTotpOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const options = useQuery({ queryKey: ['auth-options'], queryFn: authApi.options });
  const history = useQuery({ queryKey: ['my-login-history'], queryFn: authApi.loginHistory });
  const sessions = useQuery({ queryKey: ['my-sessions'], queryFn: authApi.sessions });

  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => refreshProfile(),
    onError: toast.error,
  });

  if (!admin) return null;
  const google = admin.identities.find((i) => i.provider === 'GOOGLE');

  return (
    <div className="space-y-5">
      <PageHeader title="My account & security" description="Your SmartTech admin profile, sign-in methods and activity." />

      <Card title="Profile">
        <DescriptionList
          items={[
            { label: 'Name', value: `${admin.firstName} ${admin.lastName}` },
            { label: 'Email', value: admin.email },
            { label: 'Roles', value: admin.roles.map((r) => r.name).join(', ') },
            { label: 'Last sign-in', value: formatDateTime(admin.lastLoginAt) },
            { label: 'Session policy', value: `Signs out after ${admin.sessionPolicy.idleMinutes} min idle · max ${admin.sessionPolicy.absoluteHours} h` },
            { label: 'Password', value: <Link to="/account/change-password" className="text-accent-700 hover:underline dark:text-accent-300">Change password</Link> },
          ]}
        />
      </Card>

      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent-600" /> Multi-factor authentication</span>}>
        <p className="mb-4 text-[13px] text-zinc-500">A one-time code is required on every admin sign-in, including Google sign-in.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium"><Mail className="size-4" /> Email code</span>
              {admin.mfa.preferredMethod === 'EMAIL' ? <Badge tone="accent">Default</Badge> : admin.mfa.emailFallbackAllowed ? <Badge>Fallback</Badge> : <Badge>Disabled</Badge>}
            </div>
            <p className="mt-1 text-xs text-zinc-500">A 6-digit code is emailed to {admin.email}.</p>
            {admin.mfa.preferredMethod !== 'EMAIL' && admin.mfa.emailFallbackAllowed && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => action.mutate(() => authApi.setPreferred('EMAIL'))}>Make default</Button>
            )}
          </div>
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium"><Smartphone className="size-4" /> Authenticator app</span>
              {admin.mfa.totpEnabled ? (admin.mfa.preferredMethod === 'TOTP' ? <Badge tone="accent">Default</Badge> : <Badge tone="success">Enabled</Badge>) : <Badge>Not set up</Badge>}
            </div>
            <p className="mt-1 text-xs text-zinc-500">Time-based codes from an app on your phone.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!admin.mfa.totpEnabled ? (
                <Button size="sm" onClick={() => setTotpOpen(true)}>Set up</Button>
              ) : (
                <>
                  {admin.mfa.preferredMethod !== 'TOTP' && <Button size="sm" variant="secondary" onClick={() => action.mutate(() => authApi.setPreferred('TOTP'))}>Make default</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setDisableOpen(true)}>Remove</Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-[13px] dark:bg-zinc-900">
          <span>Recovery codes remaining: <b>{admin.mfa.recoveryCodesRemaining}</b></span>
          <Button size="sm" variant="secondary" onClick={() => action.mutate(async () => setCodes((await authApi.regenerateRecoveryCodes()).recoveryCodes))}>
            Generate new codes
          </Button>
        </div>
      </Card>

      <Card title="Linked accounts">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Google</p>
            <p className="text-xs text-zinc-500">
              {google ? <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-600" /> Linked to {google.email} · {timeAgo(google.linkedAt)}</span> : 'Sign in with your Google account (a one-time code is still required).'}
            </p>
          </div>
          {google ? (
            <Button size="sm" variant="secondary" onClick={() => action.mutate(() => authApi.unlinkGoogle())} loading={action.isPending}>Unlink</Button>
          ) : options.data?.googleEnabled && options.data.googleClientId ? (
            <GoogleButton clientId={options.data.googleClientId} text="continue_with" onCredential={(t) => action.mutate(async () => { await authApi.linkGoogle(t); toast.success('Google account linked'); })} />
          ) : (
            <span className="text-xs text-zinc-500">Google sign-in is not configured on this server.</span>
          )}
        </div>
      </Card>

      <Card title="Active sessions" padded={false}>
        <DataTable
          rows={sessions.data}
          loading={sessions.isLoading}
          error={sessions.error}
          onRetry={sessions.refetch}
          rowKey={(r) => r.id}
          columns={[
            { id: 'ip', header: 'IP', cell: (r) => r.ipAddress ?? '—' },
            { id: 'ua', header: 'Device', cell: (r) => <span className="line-clamp-1 max-w-md text-xs">{r.userAgent}</span>, hideOnMobile: true },
            { id: 'started', header: 'Started', cell: (r) => formatDateTime(r.createdAt) },
            { id: 'active', header: 'Last active', cell: (r) => timeAgo(r.lastActivityAt) },
          ]}
        />
      </Card>

      <Card title="Login history" padded={false}>
        <DataTable
          rows={history.data}
          loading={history.isLoading}
          error={history.error}
          onRetry={history.refetch}
          rowKey={(r) => r.id}
          columns={[
            { id: 'time', header: 'Time', cell: (r) => formatDateTime(r.createdAt), value: (r) => r.createdAt, sortable: true },
            { id: 'method', header: 'Method', cell: (r) => r.method, value: (r) => r.method },
            { id: 'result', header: 'Result', cell: (r) => (r.success ? <Badge tone="success">Success</Badge> : <Badge tone="danger">{r.failureReason ?? 'Failed'}</Badge>) },
            { id: 'ip', header: 'IP', cell: (r) => r.ipAddress ?? '—', hideOnMobile: true },
          ]}
        />
      </Card>

      <TotpSetup open={totpOpen} onClose={() => setTotpOpen(false)} onDone={(c) => { setTotpOpen(false); setCodes(c); refreshProfile(); }} />
      <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />
      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Remove authenticator app" size="sm" footer={
        <>
          <Button variant="secondary" onClick={() => setDisableOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={disableCode.length !== 6} loading={action.isPending} onClick={() => action.mutate(async () => { await authApi.totpDisable(disableCode); setDisableOpen(false); setDisableCode(''); toast.success('Authenticator removed. Email codes are now used.'); })}>Remove</Button>
        </>
      }>
        <Field label="Current authenticator code" required hint="Email codes become your sign-in method.">
          <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))} maxLength={6} className="text-center font-mono tracking-[0.4em]" />
        </Field>
      </Modal>
    </div>
  );
}
