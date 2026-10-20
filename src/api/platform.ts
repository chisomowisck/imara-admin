import { del, download, get, post, put, type Paginated } from './client';

// ---------- dashboard & reports ----------

export interface Overview {
  totalClients: number;
  activeClients: number;
  newClientsThisMonth: number;
  suspendedClients: number;
  archivedClients: number;
  monthlyRevenue: number;
  overdueInvoices: { count: number; value: number };
  billing: {
    monthlyRevenue: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    recentPayments: number;
    recentFailures: number;
    planDistribution: { planId: number; planName: string; planCode: string; clients: number }[];
  };
  generatedAt: string;
}

export interface RevenueReport {
  monthlyRevenue: number;
  annualRevenue: number;
  yearToDate: number;
  monthlyRecurringRunRate: number;
  series: { month: string; revenue: number; invoiced: number }[];
}

export const reportsApi = {
  overview: () => get<Overview>('/admin/dashboard/overview'),
  revenue: (months = 12) => get<RevenueReport>('/admin/reports/revenue', { months }),
  distribution: () => get<Overview['billing']['planDistribution']>('/admin/reports/plan-distribution'),
  byPlan: () => get<{ plan: string; billingCycle: string; status: string; count: number }[]>('/admin/reports/subscriptions-by-plan'),
  payments: (params: Record<string, unknown>) => get<Paginated<PaymentRow> & { meta: { sum: number } }>('/admin/reports/payments', params),
  exportPayments: (params: Record<string, unknown>) => download('/admin/reports/payments', params),
  failed: (params: Record<string, unknown>) => get<Paginated<AttemptRow & { currentStatus: string }>>('/admin/reports/failed-payments', params),
  churn: (params: Record<string, unknown>) =>
    get<{ rows: { date: string; organizationId: number; event: string; reason: string | null; by: string; organization: { name: string; orgCode: string | null } | null }[]; churnedClients: number; activeAtStart: number; churnRate: number | null }>('/admin/reports/churn', params),
  stats: () => get<Record<string, any>>('/admin/ops/stats'),
};

// ---------- invoices & payments ----------

export interface InvoiceRow {
  id: number;
  number: string;
  organizationId: number;
  subscriptionId: number | null;
  planName: string;
  billingCycle: string | null;
  periodStart: string;
  periodEnd: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  creditedTotal: number;
  balance: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  billToName: string;
  billToEmail: string | null;
  emailedAt: string | null;
  paidAt: string | null;
  cancelReason: string | null;
}

export interface PaymentRow {
  id: number;
  invoiceId: number | null;
  organizationId: number;
  amount: number;
  method: string;
  gateway: string;
  reference: string | null;
  kind: 'PAYMENT' | 'REFUND';
  notes: string | null;
  paidAt: string;
  invoice?: { number: string; billToName: string } | null;
  organization?: { name: string; orgCode: string | null } | null;
}

export interface AttemptRow {
  id: number;
  invoiceId: number;
  gateway: string;
  method: string;
  amount: number;
  status: string;
  gatewayReference: string;
  failureReason: string | null;
  attemptNumber: number;
  dunningStage: number | null;
  initiatedBy: string;
  createdAt: string;
  invoice?: { number: string; billToName: string };
}

export interface InvoiceDetail extends InvoiceRow {
  lines: { id: number; description: string; quantity: number; unitPrice: number; amount: number; kind: string }[];
  payments: PaymentRow[];
  attempts: AttemptRow[];
  dunning: { stage: number; failureCount: number; firstFailedAt: string; nextRetryAt: string | null; resolvedAt: string | null; resolution: string | null } | null;
}

export const invoicesApi = {
  list: (params: Record<string, unknown>) => get<Paginated<InvoiceRow> & { meta: { sumTotal: number; sumPaid: number } }>('/admin/invoices', params),
  export: (params: Record<string, unknown>) => download('/admin/invoices/export', params),
  get: (id: number) => get<InvoiceDetail>(`/admin/invoices/${id}`),
  pdf: (id: number) => download(`/admin/invoices/${id}/pdf`),
  cancel: (id: number, reason: string) => post(`/admin/invoices/${id}/cancel`, { reason }),
  resend: (id: number) => post<{ sent: boolean }>(`/admin/invoices/${id}/resend`),
  manualPayment: (id: number, body: { amount: number; method: 'BANK_TRANSFER' | 'CASH'; reference?: string; paidAt?: string; notes?: string }) => post(`/admin/invoices/${id}/payments/manual`, body),
  retry: (id: number) => post<{ started: boolean; reason?: string }>(`/admin/invoices/${id}/retry-payment`),
  extendDue: (id: number, dueDate: string, reason: string) => post<{ updated: boolean; reason?: string }>(`/admin/invoices/${id}/extend-due-date`, { dueDate, reason }),
  creditNote: (id: number, amount: number, reason: string) => post(`/admin/invoices/${id}/credit-notes`, { amount, reason }),
  payments: (params: Record<string, unknown>) => get<Paginated<PaymentRow>>('/admin/payments', params),
  attempts: (params: Record<string, unknown>) => get<Paginated<AttemptRow>>('/admin/payment-attempts', params),
  refund: (paymentId: number, body: { amount: number; reason: string; method: 'ORIGINAL' | 'BANK_TRANSFER' | 'CASH' }) => post(`/admin/payments/${paymentId}/refund`, body),
  creditNotes: (organizationId?: number) => get<{ id: number; number: string; invoiceId: number; amount: number; reason: string; createdAt: string }[]>('/admin/credit-notes', { organizationId }),
  refunds: () => get<{ id: number; paymentId: number; amount: number; reason: string; method: string; status: string; createdAt: string }[]>('/admin/refunds'),
};

// ---------- coupons & discounts ----------

export interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  value: number;
  duration: 'ONCE' | 'REPEATING' | 'FOREVER';
  durationCycles: number | null;
  planIds: number[] | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
}

export interface TenantDiscount {
  id: number;
  description: string;
  discountType: 'PERCENT' | 'FIXED';
  value: number;
  cyclesRemaining: number | null;
  isActive: boolean;
  reason: string | null;
  createdAt: string;
}

export const couponsApi = {
  list: () => get<Coupon[]>('/admin/coupons'),
  save: (body: Partial<Coupon> & { code: string }) => put<Coupon>('/admin/coupons', body),
  discounts: (orgId: number) => get<TenantDiscount[]>(`/admin/tenants/${orgId}/discounts`),
  addDiscount: (orgId: number, body: { description: string; discountType: 'PERCENT' | 'FIXED'; value: number; cycles?: number; reason: string }) => post(`/admin/tenants/${orgId}/discounts`, body),
  apply: (orgId: number, code: string) => post(`/admin/tenants/${orgId}/coupons`, { code }),
  removeDiscount: (id: number, reason: string) => post(`/admin/discounts/${id}/remove`, { reason }),
};

// ---------- notifications & banners ----------

export interface PlatformNotification {
  id: number;
  subject: string;
  body: string;
  type: 'INFORMATIONAL' | 'WARNING' | 'ACTION_REQUIRED';
  audience: 'ONE' | 'SELECTED' | 'ALL';
  targetOrgIds: number[] | null;
  sendEmail: boolean;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdByName: string;
  recipients: number;
  emailsSent: number;
  createdAt: string;
  _count?: { deliveries: number };
}

export interface Banner {
  id: number;
  type: 'INFO' | 'WARNING' | 'MAINTENANCE' | 'ACTION_REQUIRED';
  title: string;
  message: string;
  audience: 'ALL' | 'SELECTED';
  targetOrgIds: number[] | null;
  startsAt: string | null;
  endsAt: string | null;
  dismissible: boolean;
  isActive: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: (params: Record<string, unknown>) => get<Paginated<PlatformNotification>>('/admin/notifications', params),
  compose: (body: { subject: string; body: string; type: string; audience: string; organizationIds?: number[]; sendEmail?: boolean; scheduledAt?: string }) => post<PlatformNotification>('/admin/notifications', body),
  cancel: (id: number) => post(`/admin/notifications/${id}/cancel`),
  sendNow: (id: number) => post(`/admin/notifications/${id}/send-now`),
  deliveries: (id: number) => get<{ id: number; organizationId: number; inAppCount: number; emailStatus: string | null; organization: { name: string; orgCode: string | null } | null }[]>(`/admin/notifications/${id}/deliveries`),
  banners: () => get<Banner[]>('/admin/banners'),
  saveBanner: (body: Partial<Banner> & { organizationIds?: number[] }) => put<Banner>('/admin/banners', body),
  deleteBanner: (id: number) => del(`/admin/banners/${id}`),
};

// ---------- support view ----------

export interface SupportSession {
  id: number;
  adminEmail: string;
  organizationId: number;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  resourcesViewed: string[] | null;
  organization?: { id: number; name: string; status: string };
  expiresAt?: string;
}

export const supportApi = {
  sessions: (organizationId?: number) => get<SupportSession[]>('/admin/support/sessions', { organizationId }),
  start: (organizationId: number, reason: string) => post<SupportSession>('/admin/support/sessions', { organizationId, reason }),
  end: (id: number) => post(`/admin/support/sessions/${id}/end`),
  view: <T = any>(id: number, resource: string, page = 1) => get<T>(`/admin/support/sessions/${id}/${resource}`, { page }),
};

// ---------- operations ----------

export interface JobStatus {
  name: string;
  description: string;
  schedule: string;
  period: string;
  lastRun: { id: number; status: string; trigger: string; processed: number; failed: number; summary: Record<string, unknown> | null; error: string | null; startedAt: string; finishedAt: string | null } | null;
  lastSuccessAt: string | null;
}

export const opsApi = {
  jobs: () => get<JobStatus[]>('/admin/ops/jobs'),
  runs: (name: string) => get<NonNullable<JobStatus['lastRun']>[]>(`/admin/ops/jobs/${name}/runs`),
  run: (name: string) => post<JobStatus['lastRun']>(`/admin/ops/jobs/${name}/run`),
  failedJobs: () => get<{ id: number; jobName: string; itemType: string | null; itemId: string | null; error: string; attempts: number; lastAttemptAt: string; resolvedAt: string | null; createdAt: string }[]>('/admin/ops/failed-jobs'),
  retryFailed: (id: number) => post<{ retried: boolean; result?: unknown; error?: string }>(`/admin/ops/failed-jobs/${id}/retry`),
  resolveFailed: (id: number) => post(`/admin/ops/failed-jobs/${id}/resolve`),
  webhooks: () => get<{ id: number; gateway: string; eventId: string; signatureValid: boolean; eventType: string | null; reference: string | null; payload: unknown; status: string; attempts: number; error: string | null; receivedAt: string; processedAt: string | null }[]>('/admin/ops/webhooks'),
  reprocess: (id: number) => post(`/admin/ops/webhooks/${id}/reprocess`),
  emailLogs: () => get<{ id: number; to: string; templateKey: string; subject: string; status: string; error: string | null; organizationId: number | null; createdAt: string }[]>('/admin/config/email-logs'),
};

// ---------- configuration ----------

export const configApi = {
  settings: () => get<Record<string, Record<string, any>>>('/admin/config/settings'),
  saveSettings: (category: string, body: Record<string, unknown>) => put<Record<string, any>>(`/admin/config/settings/${category}`, body),
  reference: (type: string) => get<{ id: number; type: string; code: string; name: string; sortOrder: number; isActive: boolean; meta: Record<string, unknown> | null }[]>(`/admin/config/reference/${type}`),
  saveReference: (type: string, body: { code: string; name: string; sortOrder?: number; isActive?: boolean; meta?: Record<string, unknown> }) => put(`/admin/config/reference/${type}`, body),
  rates: () => get<{ latest: { quoteCurrency: string; rate: number; effectiveDate: string }[]; history: { id: number; quoteCurrency: string; rate: number; effectiveDate: string; source: string | null }[] }>('/admin/config/exchange-rates'),
  addRate: (body: { quoteCurrency: string; rate: number; effectiveDate: string; source?: string }) => post('/admin/config/exchange-rates', body),
  taxRules: () => get<{ id: number; countryCode: string; taxType: string; name: string; rate: number; effectiveFrom: string; isActive: boolean; notes: string | null }[]>('/admin/config/tax-rules'),
  saveTaxRule: (body: Record<string, unknown>) => put('/admin/config/tax-rules', body),
  coaTemplates: () => get<{ id: number; code: string; name: string; description: string | null; orgCategoryCode: string | null; industryCode: string | null; isDefault: boolean; isActive: boolean; _count: { accounts: number } }[]>('/admin/config/coa-templates'),
  coaTemplate: (id: number) => get<any>(`/admin/config/coa-templates/${id}`),
  saveCoaTemplate: (body: Record<string, unknown>) => put('/admin/config/coa-templates', body),
  roleTemplates: () => get<{ templates: { id: number; code: string; name: string; description: string | null; permissions: string[]; isActive: boolean; updatedAt: string }[]; permissions: { name: string; module: string; action: string; description: string | null }[] }>('/admin/config/role-templates'),
  saveRoleTemplate: (code: string, body: { name: string; description?: string; permissions: string[] }) => put(`/admin/config/role-templates/${code}`, body),
  modules: () => get<{ id: number; code: string; name: string; description: string | null; isCore: boolean; isActive: boolean; sortOrder: number }[]>('/admin/config/modules'),
  saveModule: (code: string, body: { name?: string; description?: string; isActive?: boolean; sortOrder?: number }) => put(`/admin/config/modules/${code}`, body),
  emailTemplates: () => get<{ key: string; name: string; subject: string; html: string; variables: string[]; customised: boolean; isActive: boolean; updatedAt: string | null }[]>('/admin/config/email-templates'),
  saveEmailTemplate: (key: string, body: { subject: string; html: string; isActive?: boolean }) => put(`/admin/config/email-templates/${key}`, body),
  resetEmailTemplate: (key: string) => del(`/admin/config/email-templates/${key}`),
  previewEmailTemplate: (key: string, body?: { subject: string; html: string }) => post<{ subject: string; html: string; text: string }>(`/admin/config/email-templates/${key}/preview`, body ?? {}),
  testEmailTemplate: (key: string, to: string) => post<{ sent: boolean }>(`/admin/config/email-templates/${key}/test`, { to }),
};
