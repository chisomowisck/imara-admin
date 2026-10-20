import type { ComponentType } from 'react';
import type { TenantDetail } from '@/api/tenants';

/**
 * Slots the billing features fill on the organisation detail page
 * (Modules tab, Billing tab, extra header actions such as Change plan).
 */
export const tenantTabExtensions: {
  modules?: ComponentType<{ tenant: TenantDetail }>;
  billing?: ComponentType<{ tenant: TenantDetail }>;
  billingExtra?: ComponentType<{ tenant: TenantDetail }>;
  headerActions?: ComponentType<{ tenant: TenantDetail; onChanged: () => void }>;
} = {};
