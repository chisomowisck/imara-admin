import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth, RequirePermission } from '@/auth/guards';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/States';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ChangePasswordPage, ForgotPasswordPage, SetPasswordPage } from '@/pages/auth/PasswordPages';
import { AccountPage } from '@/pages/account/AccountPage';
import { AdminsPage } from '@/pages/admins/AdminsPage';
import { RolesPage } from '@/pages/admins/RolesPage';
import { AuditPage } from '@/pages/audit/AuditPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TenantsPage } from '@/pages/tenants/TenantsPage';
import { TenantDetailPage } from '@/pages/tenants/TenantDetailPage';
import { PlansPage } from '@/pages/billing/PlansPage';
import { SubscriptionsPage } from '@/pages/billing/SubscriptionsPage';
import { UsagePage } from '@/pages/billing/UsagePage';
import '@/pages/billing/TenantBillingTabs';
import '@/pages/billing/TenantBillingExtra';
import { InvoicesPage } from '@/pages/billing/InvoicesPage';
import { PaymentsPage } from '@/pages/billing/PaymentsPage';
import { CouponsPage } from '@/pages/billing/CouponsPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { ComposeNotificationPage, NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { SupportPage } from '@/pages/support/SupportPage';
import { ConfigurationPage } from '@/pages/config/ConfigurationPage';
import { SystemHealthPage } from '@/pages/ops/SystemHealthPage';
import { DocumentTemplatesPage } from '@/pages/documents/DocumentTemplatesPage';
import { DocumentTemplateEditorPage } from '@/pages/documents/DocumentTemplateEditorPage';
import { ApiError } from '@/api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'tenants', element: <RequirePermission all={['tenants.view']}><TenantsPage /></RequirePermission> },
          { path: 'tenants/:id', element: <RequirePermission all={['tenants.view']}><TenantDetailPage /></RequirePermission> },
          { path: 'billing/plans', element: <RequirePermission all={['plans.view']}><PlansPage /></RequirePermission> },
          { path: 'billing/subscriptions', element: <RequirePermission all={['subscriptions.view']}><SubscriptionsPage /></RequirePermission> },
          { path: 'billing/usage', element: <RequirePermission all={['usage.view']}><UsagePage /></RequirePermission> },
          { path: 'billing/invoices', element: <RequirePermission all={['billing.view']}><InvoicesPage /></RequirePermission> },
          { path: 'billing/payments', element: <RequirePermission all={['billing.view']}><PaymentsPage /></RequirePermission> },
          { path: 'billing/coupons', element: <RequirePermission all={['coupons.manage']}><CouponsPage /></RequirePermission> },
          { path: 'reports', element: <RequirePermission all={['reports.view']}><ReportsPage /></RequirePermission> },
          { path: 'notifications', element: <RequirePermission all={['notifications.view']}><NotificationsPage /></RequirePermission> },
          { path: 'notifications/new', element: <RequirePermission all={['notifications.send']}><ComposeNotificationPage /></RequirePermission> },
          { path: 'support', element: <RequirePermission all={['support.view']}><SupportPage /></RequirePermission> },
          { path: 'config', element: <RequirePermission all={['config.view']}><ConfigurationPage /></RequirePermission> },
          { path: 'documents', element: <RequirePermission all={['config.view']}><DocumentTemplatesPage /></RequirePermission> },
          { path: 'documents/new', element: <RequirePermission all={['config.view']}><DocumentTemplateEditorPage /></RequirePermission> },
          { path: 'documents/:id', element: <RequirePermission all={['config.view']}><DocumentTemplateEditorPage /></RequirePermission> },
          { path: 'ops', element: <RequirePermission all={['ops.view']}><SystemHealthPage /></RequirePermission> },
          { path: 'admins', element: <RequirePermission all={['admins.view']}><AdminsPage /></RequirePermission> },
          { path: 'roles', element: <RequirePermission all={['admins.view']}><RolesPage /></RequirePermission> },
          { path: 'audit', element: <RequirePermission all={['audit.view']}><AuditPage /></RequirePermission> },
          { path: 'account', element: <AccountPage /> },
          { path: 'account/change-password', element: <ChangePasswordPage /> },
          { path: '*', element: <EmptyState title="Page not found" description="This page does not exist or is not available yet." /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
