import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Mail, Smartphone } from 'lucide-react';
import { authApi, type MfaChallenge, type MfaMethod } from '@/api/auth';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { admin, completeLogin, sessionEndReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const options = useQuery({ queryKey: ['auth-options'], queryFn: authApi.options, retry: false });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => setCode(''), [challenge?.method, useRecovery]);

  if (admin) return <Navigate to={from} replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    run(async () => setChallenge(await authApi.login(email, password)));
  };

  const submitGoogle = (idToken: string) => run(async () => setChallenge(await authApi.loginGoogle(idToken)));

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    run(async () => {
      const tokens = await authApi.verify(challenge.challengeId, code.trim(), useRecovery ? 'RECOVERY' : challenge.method);
      completeLogin(tokens);
      navigate(tokens.mustChangePassword ? '/account/change-password' : from, { replace: true });
    });
  };

  const switchTo = (method: MfaMethod) =>
    challenge &&
    run(async () => {
      const res = await authApi.switchMethod(challenge.challengeId, method);
      setUseRecovery(false);
      setChallenge({ ...challenge, method: res.method, emailHint: res.emailHint });
      setInfo(method === 'EMAIL' ? `We sent a new code to ${res.emailHint}.` : null);
    });

  if (challenge) {
    const methodLabel = useRecovery
      ? 'Enter one of your recovery codes.'
      : challenge.method === 'TOTP'
        ? 'Enter the 6-digit code from your authenticator app.'
        : `Enter the 6-digit code we emailed to ${challenge.emailHint}.`;
    return (
      <AuthLayout title="Verify it's you" subtitle={methodLabel}>
        <form onSubmit={submitCode} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {info && !error && <Alert tone="info">{info}</Alert>}
          <Field label={useRecovery ? 'Recovery code' : 'Verification code'} required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoFocus
              maxLength={useRecovery ? 20 : 6}
              className="text-center font-mono text-lg tracking-[0.4em]"
              placeholder={useRecovery ? 'XXXXXX-XXXXXX' : '••••••'}
            />
          </Field>
          <Button type="submit" className="w-full" loading={busy} disabled={code.trim().length < 6}>
            Verify and sign in
          </Button>
          <div className="space-y-1.5 border-t border-zinc-200 pt-3 text-[13px] dark:border-zinc-800">
            {challenge.availableMethods.includes('TOTP') && (challenge.method !== 'TOTP' || useRecovery) && (
              <button type="button" className="flex items-center gap-2 text-accent-700 hover:underline dark:text-accent-300" onClick={() => switchTo('TOTP')}>
                <Smartphone className="size-3.5" /> Use my authenticator app
              </button>
            )}
            {challenge.availableMethods.includes('EMAIL') && (challenge.method !== 'EMAIL' || useRecovery) && (
              <button type="button" className="flex items-center gap-2 text-accent-700 hover:underline dark:text-accent-300" onClick={() => switchTo('EMAIL')}>
                <Mail className="size-3.5" /> Email me a code instead
              </button>
            )}
            {challenge.method === 'EMAIL' && !useRecovery && (
              <button type="button" className="flex items-center gap-2 text-zinc-600 hover:underline dark:text-zinc-400" onClick={() => switchTo('EMAIL')}>
                <Mail className="size-3.5" /> Resend the email code
              </button>
            )}
            {!useRecovery && (
              <button type="button" className="flex items-center gap-2 text-zinc-600 hover:underline dark:text-zinc-400" onClick={() => setUseRecovery(true)}>
                <KeyRound className="size-3.5" /> Use a recovery code
              </button>
            )}
            <button type="button" className="text-zinc-500 hover:underline" onClick={() => { setChallenge(null); setError(null); setInfo(null); }}>
              ← Start over
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your SmartTech admin account. A one-time code is always required.">
      <form onSubmit={submitPassword} className="space-y-4">
        {sessionEndReason && !error && <Alert tone="warning">{sessionEndReason}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          Continue
        </Button>
        <div className="text-right">
          <Link to="/forgot-password" className="text-xs text-accent-700 hover:underline dark:text-accent-300">
            Forgot password?
          </Link>
        </div>
      </form>
      {options.data?.googleEnabled && options.data.googleClientId && (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] text-zinc-400 uppercase">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <GoogleButton clientId={options.data.googleClientId} onCredential={submitGoogle} />
          <p className="mt-2 text-center text-[11px] text-zinc-500">Only for existing admin accounts. A one-time code is still required.</p>
        </>
      )}
      {options.isError && <p className="mt-4 text-center text-xs text-red-600">Cannot reach the Imara API.</p>}
    </AuthLayout>
  );
}
