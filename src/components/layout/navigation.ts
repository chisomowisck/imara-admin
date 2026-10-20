import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shown when the admin has ANY of these permissions. */
  permissions: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Items are hidden when the admin lacks the permission.
 * Sections are added here as each build phase lands.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, permissions: ['dashboard.view'] }],
  },
  {
    title: 'Clients',
    items: [{ label: 'Organisations', to: '/tenants', icon: Building2, permissions: ['tenants.view'] }],
  },
  {
    title: 'Billing & Metering',
    items: [
      { label: 'Plans', to: '/billing/plans', icon: Package, permissions: ['plans.view'] },
      { label: 'Subscriptions', to: '/billing/subscriptions', icon: CreditCard, permissions: ['subscriptions.view'] },
      { label: 'Invoices', to: '/billing/invoices', icon: Receipt, permissions: ['billing.view'] },
      { label: 'Payments', to: '/billing/payments', icon: FileText, permissions: ['billing.view'] },
      { label: 'Coupons', to: '/billing/coupons', icon: Tag, permissions: ['coupons.manage'] },
      { label: 'Usage & limits', to: '/billing/usage', icon: Gauge, permissions: ['usage.view'] },
      { label: 'Revenue reports', to: '/reports', icon: BarChart3, permissions: ['reports.view'] },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { label: 'Notifications', to: '/notifications', icon: Bell, permissions: ['notifications.view'] },
      { label: 'Support view', to: '/support', icon: LifeBuoy, permissions: ['support.view'] },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Configuration', to: '/config', icon: Settings, permissions: ['config.view'] },
      { label: 'System health', to: '/ops', icon: Activity, permissions: ['ops.view'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Platform users', to: '/admins', icon: Users, permissions: ['admins.view'] },
      { label: 'Roles & permissions', to: '/roles', icon: ShieldCheck, permissions: ['admins.view'] },
      { label: 'Audit trail', to: '/audit', icon: ScrollText, permissions: ['audit.view'] },
      { label: 'My account', to: '/account', icon: KeyRound, permissions: [] },
    ],
  },
];

/** Routes that exist in the app so far (others are hidden from the sidebar until built). */
export const AVAILABLE_ROUTES = new Set<string>(['/', '/tenants', '/admins', '/roles', '/audit', '/account']);
