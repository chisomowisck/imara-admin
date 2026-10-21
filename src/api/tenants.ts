import { download, get, post, type Paginated } from './client';
import type { AuditRow } from './admins';

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'PENDING_PAYMENT' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED';
export type TenantAction = 'SUSPEND' | 'REACTIVATE' | 'OFFBOARD' | 'RESTORE' | 'PURGE';

export interface TenantRow {
  id: number;
  orgCode: string | null;
  name: string;
  slug: string;
  type: string;
  orgCategoryCode: string | null;
  industry: string | null;
  status: TenantStatus;
  statusChangedAt: string | null;
  statusReason: string | null;
  provisionedAt: string | null;
  lastLoginAt: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  email: string | null;
  district: string | null;
  country: string | null;
  trialEndsAt: string | null;
  retentionEndsAt: string | null;
  createdAt: string;
  activeUsers: number;
  allowedActions: TenantAction[];
  planName?: string | null;
  planCode?: string | null;
  billingCycle?: string | null;
  subscriptionStatus?: string | null;
  outstandingBalance?: number | null;
}

export interface StatusHistoryRow {
  id: number;
  fromStatus: TenantStatus | null;
  toStatus: TenantStatus;
  reason: string;
  actorType: string;
  actorEmail: string | null;
  createdAt: string;
}

export interface TenantDetail extends TenantRow {
  registrationNumber: string | null;
  tin: string | null;
  size: string | null;
  employeeCount: number | null;
  yearEstablished: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  phone: string | null;
  website: string | null;
  archivedAt: string | null;
  createdBy: { id: number; email: string; firstName: string; lastName: string };
  financialSettings: Record<string, unknown> | null;
  taxSettings: Record<string, unknown> | null;
  statusHistory: StatusHistoryRow[];
  retentionDays: number;
  retentionExpired: boolean;
  _count: { members: number };
  [key: string]: unknown;
}

export interface TenantUser {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  memberStatus: string;
  userStatus: string;
  lastLoginAt: string | null;
  joinedAt: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface TenantNote {
  id: number;
  adminId: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ActionPreview {
  organization: { id: number; name: string; orgCode: string | null; status: TenantStatus; retentionEndsAt: string | null };
  action: TenantAction;
  allowed: boolean;
  reasonIfNot: string | null;
  consequences: string[];
  archiveEndDate?: string;
  purge?: { tables: { table: string; rows: number }[]; totalRows: number };
  confirmationToken: string | null;
}

export const tenantsApi = {
  list: (params: Record<string, unknown>) => get<Paginated<TenantRow>>('/admin/tenants', params),
  export: (params: Record<string, unknown>) => download('/admin/tenants/export', params),
  get: (id: number) => get<TenantDetail>(`/admin/tenants/${id}`),
  users: (id: number) => get<TenantUser[]>(`/admin/tenants/${id}/users`),
  activity: (id: number, params: Record<string, unknown>) => get<Paginated<AuditRow>>(`/admin/tenants/${id}/activity`, params),
  exportActivity: (id: number, format: string) => download(`/admin/tenants/${id}/activity/export`, { format }),
  notes: (id: number) => get<TenantNote[]>(`/admin/tenants/${id}/notes`),
  addNote: (id: number, body: string) => post<TenantNote>(`/admin/tenants/${id}/notes`, { body }),
  suspend: (id: number, reason: string) => post(`/admin/tenants/${id}/suspend`, { reason }),
  reactivate: (id: number, reason: string) => post(`/admin/tenants/${id}/reactivate`, { reason }),
  bulkSuspend: (organizationIds: number[], reason: string) =>
    post<{ succeeded: number; failed: number; results: { id: number; ok: boolean; error?: string }[] }>('/admin/tenants/bulk/suspend', { organizationIds, reason }),
  preview: (id: number, action: 'offboard' | 'restore' | 'purge') => get<ActionPreview>(`/admin/tenants/${id}/${action}/preview`),
  offboard: (id: number, reason: string, confirmationToken: string) => post(`/admin/tenants/${id}/offboard`, { reason, confirmationToken }),
  restore: (id: number, reason: string, confirmationToken: string) => post(`/admin/tenants/${id}/restore`, { reason, confirmationToken }),
  purge: (id: number, reason: string, confirmationToken: string, confirmName: string) =>
    post(`/admin/tenants/${id}/purge`, { reason, confirmationToken, confirmName }),
};

export const SUSPEND_REASONS = ['Payment Overdue', 'Policy Violation', 'Client Request', 'Fraud Investigation'];
export const REACTIVATE_REASONS = ['Payment Received', 'Issue Resolved', 'Client Request'];
export const OFFBOARD_REASONS = ['Client Request', 'Non-payment', 'Policy Violation', 'Business Closed'];
