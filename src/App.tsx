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
