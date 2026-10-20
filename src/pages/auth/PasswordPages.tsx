import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui/primitives';
import { AuthLayout } from './AuthLayout';

export const PASSWORD_RULES = 'At least 12 characters with an uppercase letter, a lowercase letter, a digit and a symbol. You cannot reuse your last 5 passwords.';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgot(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">If an active admin account exists for {email}, a reset link is on its way.</Alert>
          <Link to="/login" className="text-[13px] text-accent-700 hover:underline">← Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
          <Link to="/login" className="block text-center text-[13px] text-zinc-500 hover:underline">Back to sign in</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError(null);
    try {
      await authApi.setPassword(token, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Set your password" subtitle={PASSWORD_RULES}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password is set. Sign in with it; you'll also be asked for a one-time code.</Alert>
          <Link to="/login" className="text-[13px] text-accent-700 hover:underline">Go to sign in →</Link>
        </div>
      ) : !token ? (
        <Alert tone="danger">This link is missing its token. Ask your Super Administrator for a new invitation.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="New password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Set password</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const { admin, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      await refreshProfile();
      navigate('/account', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-lg">
      <PageHeader title="Change password" description={admin?.mustChangePassword ? 'You must set a new password before continuing.' : undefined} />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-xs text-zinc-500">{PASSWORD_RULES}</p>
          <Field label="Current password" required>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password" required>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Button type="submit" loading={busy}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}
