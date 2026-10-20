import { del, get, post, put } from './client';

export type MfaMethod = 'EMAIL' | 'TOTP';

export interface LoginOptions {
  googleEnabled: boolean;
  googleClientId: string | null;
  mfaMethods: MfaMethod[];
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  method: MfaMethod;
  availableMethods: MfaMethod[];
  emailHint: string;
  expiresAt: string;
}

export interface AdminProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  roles: { code: string; name: string }[];
  permissions: string[];
  mfa: { preferredMethod: MfaMethod; totpEnabled: boolean; emailFallbackAllowed: boolean; recoveryCodesRemaining: number };
  identities: { provider: string; email: string | null; linkedAt: string }[];
  hasPassword: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  sessionPolicy: { idleMinutes: number; absoluteHours: number };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  sessionId: number;
  expiresAt: string;
  admin: AdminProfile;
  mustChangePassword: boolean;
}

export interface LoginHistoryRow {
  id: number;
  email: string;
  method: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const authApi = {
  options: () => get<LoginOptions>('/admin/auth/options'),
  login: (email: string, password: string) => post<MfaChallenge>('/admin/auth/login', { email, password }),
  loginGoogle: (idToken: string) => post<MfaChallenge>('/admin/auth/login/google', { idToken }),
  switchMethod: (challengeId: string, method: MfaMethod) =>
    post<{ challengeId: string; method: MfaMethod; emailHint: string }>('/admin/auth/mfa/send', { challengeId, method }),
  verify: (challengeId: string, code: string, method?: MfaMethod | 'RECOVERY') =>
    post<TokenResponse>('/admin/auth/mfa/verify', { challengeId, code, method }),
  me: () => get<AdminProfile>('/admin/auth/me'),
  logout: () => post<void>('/admin/auth/logout'),
  forgot: (email: string) => post<{ sent: boolean }>('/admin/auth/password/forgot', { email }),
  setPassword: (token: string, newPassword: string) => post<{ set: boolean }>('/admin/auth/password/set', { token, newPassword }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ changed: boolean }>('/admin/auth/password/change', { currentPassword, newPassword }),
  totpSetup: () => post<{ otpauthUrl: string; qrCodeDataUrl: string; manualKey: string }>('/admin/auth/mfa/totp/setup'),
  totpConfirm: (code: string) => post<{ enabled: boolean; recoveryCodes: string[] }>('/admin/auth/mfa/totp/confirm', { code }),
  totpDisable: (code: string) => post<{ disabled: boolean }>('/admin/auth/mfa/totp/disable', { code }),
  setPreferred: (method: MfaMethod) => put<{ preferredMethod: MfaMethod }>('/admin/auth/mfa/preferred', { method }),
  regenerateRecoveryCodes: () => post<{ recoveryCodes: string[] }>('/admin/auth/mfa/recovery-codes'),
  linkGoogle: (idToken: string) => post<{ linked: boolean; email: string }>('/admin/auth/identities/google', { idToken }),
  unlinkGoogle: () => del<{ unlinked: boolean }>('/admin/auth/identities/google'),
  loginHistory: () => get<LoginHistoryRow[]>('/admin/auth/login-history'),
  sessions: () =>
    get<{ id: number; ipAddress: string | null; userAgent: string | null; createdAt: string; lastActivityAt: string; expiresAt: string }[]>(
      '/admin/auth/sessions',
    ),
};
