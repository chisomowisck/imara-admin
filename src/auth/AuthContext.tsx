import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type AdminProfile, type TokenResponse } from '@/api/auth';
import { ApiError, onSessionEnded, sessionStore } from '@/api/client';

interface AuthState {
  admin: AdminProfile | null;
  initializing: boolean;
  sessionEndReason: string | null;
  completeLogin: (tokens: TokenResponse) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const SESSION_END_MESSAGES: Record<string, string> = {
  SESSION_IDLE_TIMEOUT: 'You were signed out after a period of inactivity.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  SESSION_REVOKED: 'Your session was ended. Please sign in again.',
  ADMIN_ACCOUNT_INACTIVE: 'Your admin account is not active.',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionEndReason, setSessionEndReason] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const profile = await authApi.me();
    setAdmin(profile);
  }, []);

  useEffect(() => {
    if (!sessionStore.get()) {
      setInitializing(false);
      return;
    }
    refreshProfile()
      .catch((e) => {
        // Keep the session on network errors (e.g. API restarting); drop it only when rejected.
        if (e instanceof ApiError && e.status === 401) sessionStore.clear();
      })
      .finally(() => setInitializing(false));
  }, [refreshProfile]);

  useEffect(
    () =>
      onSessionEnded((code) => {
        setAdmin(null);
        queryClient.clear();
        setSessionEndReason(SESSION_END_MESSAGES[code] ?? 'Please sign in again.');
      }),
    [queryClient],
  );

  const completeLogin = useCallback((tokens: TokenResponse) => {
    sessionStore.set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    setSessionEndReason(null);
    setAdmin(tokens.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* session may already be gone */
    }
    sessionStore.clear();
    queryClient.clear();
    setAdmin(null);
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const granted = new Set(admin?.permissions ?? []);
    return {
      admin,
      initializing,
      sessionEndReason,
      completeLogin,
      refreshProfile,
      logout,
      can: (...p) => p.every((x) => granted.has(x)),
      canAny: (...p) => p.some((x) => granted.has(x)),
    };
  }, [admin, initializing, sessionEndReason, completeLogin, refreshProfile, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
