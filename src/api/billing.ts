import { get, patch, post, put, type Paginated } from './client';

export type Metric = 'USERS' | 'TRANSACTIONS_PER_MONTH' | 'STORAGE_MB';
export type Cycle = 'MONTHLY' | 'ANNUAL';

export interface PlatformModule {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isCore: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface PlanVersionView {
  id: number;
  version: number;
  monthlyPrice: number;
  annualPrice: number;
  allowMonthly: boolean;
  allowAnnual: boolean;
  currency: string;
  modules: string[];
  limits: Record<Metric, number | null>;
  createdAt: string;
}

export interface PlanVersionRecord {
  id: number;
  version: number;
  monthlyPrice: string;
  annualPrice: string;
  changeNote: string | null;
  createdAt: string;
  modules: { moduleCode: string }[];
  limits: { metric: Metric; value: number | null }[];
  _count: { subscriptions: number };
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  isPublic: boolean;
  sortOrder: number;
  activeSubscriptions: number;
  createdAt: string;
  updatedAt: string;
  currentVersion: PlanVersionView | null;
}

export interface PlanInput {
  name: string;
  description?: string;
  monthlyPrice: number;
  annualPrice: number;
  allowMonthly: boolean;
  allowAnnual: boolean;
  modules: string[];
  limits: Record<Metric, number | null>;
  isPublic: boolean;
  sortOrder?: number;
  changeNote?: string;
}

export interface Subscription {
  id: number;
  organizationId: number;
  planId: number;
  planVersionId: number;
  billingCycle: Cycle;
  status: string;
  autoRenew: boolean;
  paymentMethod: string | null;
  startDate: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  pendingPlanId: number | null;
  pendingBillingCycle: Cycle | null;
  isLegacy: boolean;
  plan: { id: number; code: string; name: string };
  planVersion: { id: number; version: number; monthlyPrice: string | number; annualPrice: string | number };
  organization?: { id: number; name: string; orgCode: string | null; status: string } | null;
}

export interface SubscriptionEvent {
  id: number;
  type: string;
  details: Record<string, unknown> | null;
  reason: string | null;
  actorType: string;
  actorEmail: string | null;
  createdAt: string;
}

export interface TenantModule {
  code: string;
  name: string;
  description: string | null;
  isCore: boolean;
  inPlan: boolean;
  override: boolean | null;
  enabled: boolean;
}

export interface UsageFigure {
  metric: Metric;
  used: number;
  limit: number | null;
  percent: number | null;
  state: 'OK' | 'NEAR_LIMIT' | 'AT_LIMIT' | 'OVER_LIMIT';
  estimated?: boolean;
}

export const METRIC_LABELS: Record<Metric, string> = {
  USERS: 'Users',
  TRANSACTIONS_PER_MONTH: 'Transactions / month',
  STORAGE_MB: 'Storage (MB)',
};

export const plansApi = {
  list: () => get<Plan[]>('/admin/plans'),
  modules: () => get<PlatformModule[]>('/admin/plans/modules'),
  get: (id: number) => get<Plan>(`/admin/plans/${id}`),
  versions: (id: number) => get<PlanVersionRecord[]>(`/admin/plans/${id}/versions`),
  create: (body: PlanInput) => post<Plan>('/admin/plans', body),
  update: (id: number, body: Partial<PlanInput>) => patch<Plan>(`/admin/plans/${id}`, body),
  deactivate: (id: number, reason: string) => post<Plan>(`/admin/plans/${id}/deactivate`, { reason }),
  reactivate: (id: number, reason: string) => post<Plan>(`/admin/plans/${id}/reactivate`, { reason }),
};

export const subscriptionsApi = {
  list: (params: Record<string, unknown>) => get<Paginated<Subscription>>('/admin/subscriptions', params),
  forTenant: (id: number) => get<{ current: Subscription | null; latest: Subscription | null; events: SubscriptionEvent[] }>(`/admin/tenants/${id}/subscription`),
  assign: (id: number, body: { planId: number; billingCycle: Cycle; trial: boolean; reason: string }) => post<Subscription>(`/admin/tenants/${id}/subscription`, body),
  changePlan: (id: number, body: { planId: number; billingCycle: Cycle; reason: string }) =>
    post<{ effective: 'IMMEDIATE' | 'NEXT_BILLING_CYCLE'; effectiveDate: string | null }>(`/admin/tenants/${id}/subscription/change-plan`, body),
  cancel: (id: number, reason: string) => post(`/admin/tenants/${id}/subscription/cancel`, { reason }),
  reactivate: (id: number, reason: string) => post(`/admin/tenants/${id}/subscription/reactivate`, { reason }),
  extendTrial: (id: number, body: { days?: number; until?: string; reason: string }) => post<{ trialEndsAt: string }>(`/admin/tenants/${id}/subscription/extend-trial`, body),
  modules: (id: number) => get<TenantModule[]>(`/admin/tenants/${id}/modules`),
  toggleModule: (id: number, code: string, enabled: boolean | null, reason: string) => put<TenantModule>(`/admin/tenants/${id}/modules/${code}`, { enabled, reason }),
  usage: (id: number) => get<UsageFigure[]>(`/admin/tenants/${id}/usage`),
  allUsage: (params: Record<string, unknown>) =>
    get<Paginated<{ organization: { id: number; name: string; orgCode: string | null; status: string }; figures: UsageFigure[]; worst: string }>>('/admin/usage', params),
};
