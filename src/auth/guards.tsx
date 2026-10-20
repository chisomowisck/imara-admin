import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { ForbiddenState } from '@/components/ui/States';

/** Requires a signed-in admin (MFA is part of sign-in, so a session implies MFA passed). */
export function RequireAuth() {
  const { admin, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageSpinner />;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (admin.mustChangePassword && location.pathname !== '/account/change-password') {
    return <Navigate to="/account/change-password" replace />;
  }
  return <Outlet />;
}

/** Route-level permission gate. The backend enforces the same permissions on every endpoint. */
export function RequirePermission({ all, any, children }: { all?: string[]; any?: string[]; children: ReactNode }) {
  const { can, canAny } = useAuth();
  const ok = (all ? can(...all) : true) && (any ? canAny(...any) : true);
  return ok ? <>{children}</> : <ForbiddenState />;
}

/** Hides children when the admin lacks a permission (for buttons and menu items). */
export function Can({ all, any, children }: { all?: string[]; any?: string[]; children: ReactNode }) {
  const { can, canAny } = useAuth();
  const ok = (all ? can(...all) : true) && (any ? canAny(...any) : true);
  return ok ? <>{children}</> : null;
}
