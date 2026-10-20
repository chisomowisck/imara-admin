import { download, get, patch, post, del, type Paginated } from './client';
import type { LoginHistoryRow } from './auth';

export interface PlatformAdminRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  preferredMfaMethod: 'EMAIL' | 'TOTP';
  totpEnabled: boolean;
  hasPassword: boolean;
  invitationPending: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lockedUntil: string | null;
  createdAt: string;
  roles: { code: string; name: string }[];
  identities: { provider: string; email: string | null }[];
}

export interface PlatformRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  adminCount: number;
  permissions: string[];
}

export interface PlatformPermission {
  id: number;
  code: string;
  group: string;
  description: string | null;
}

export interface AuditRow {
  id: number;
  adminId: number | null;
  actorType: string;
  actorEmail: string | null;
  action: string;
  organizationId: number | null;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  reason: string | null;
  isCritical: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const adminsApi = {
  list: (params: Record<string, unknown>) => get<Paginated<PlatformAdminRow>>('/admin/admins', params),
  get: (id: number) => get<PlatformAdminRow>(`/admin/admins/${id}`),
  create: (body: { email: string; firstName: string; lastName: string; phone?: string; roleCodes: string[] }) =>
    post<PlatformAdminRow & { invitation: { sent: boolean; devLink?: string } }>('/admin/admins', body),
  update: (id: number, body: Partial<{ firstName: string; lastName: string; phone: string; roleCodes: string[] }>) =>
    patch<PlatformAdminRow>(`/admin/admins/${id}`, body),
  suspend: (id: number, reason: string) => post<PlatformAdminRow>(`/admin/admins/${id}/suspend`, { reason }),
  reactivate: (id: number, reason: string) => post<PlatformAdminRow>(`/admin/admins/${id}/reactivate`, { reason }),
  resetMfa: (id: number, reason: string) => post(`/admin/admins/${id}/reset-mfa`, { reason }),
  revokeSessions: (id: number, reason: string) => post(`/admin/admins/${id}/revoke-sessions`, { reason }),
  sendPasswordReset: (id: number) => post<{ sent: boolean; devLink?: string }>(`/admin/admins/${id}/send-password-reset`),
  loginHistory: (id: number) => get<LoginHistoryRow[]>(`/admin/admins/${id}/login-history`),
};

export const rolesApi = {
  list: () => get<PlatformRole[]>('/admin/roles'),
  permissions: () => get<PlatformPermission[]>('/admin/permissions'),
  create: (body: { code: string; name: string; description?: string; permissionCodes: string[] }) =>
    post<PlatformRole>('/admin/roles', body),
  update: (id: number, body: { name?: string; description?: string; permissionCodes?: string[] }) =>
    patch<PlatformRole>(`/admin/roles/${id}`, body),
  remove: (id: number) => del(`/admin/roles/${id}`),
};

export const auditApi = {
  list: (params: Record<string, unknown>) => get<Paginated<AuditRow>>('/admin/audit', params),
  actions: () => get<string[]>('/admin/audit/actions'),
  export: (params: Record<string, unknown>) => download('/admin/audit/export', params),
};
