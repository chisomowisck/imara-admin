import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import { Card, PageHeader } from '@/components/ui/primitives';

/** Phase 1 landing page. The PRD overview widgets arrive in Phase 6. */
export function DashboardPage() {
  const { admin, can } = useAuth();
  return (
    <div>
      <PageHeader title={`Welcome, ${admin?.firstName}`} description="Imara platform administration for SmartTech staff." />
      <div className="grid gap-4 md:grid-cols-3">
        {can('admins.view') && (
          <Card title="Platform users">
            <p className="text-[13px] text-zinc-500">Invite staff, assign roles and manage MFA.</p>
            <Link to="/admins" className="mt-3 inline-block text-[13px] font-medium text-accent-700 hover:underline dark:text-accent-300">Open →</Link>
          </Card>
        )}
        {can('audit.view') && (
          <Card title="Audit trail">
            <p className="text-[13px] text-zinc-500">Every admin action, searchable and exportable.</p>
            <Link to="/audit" className="mt-3 inline-block text-[13px] font-medium text-accent-700 hover:underline dark:text-accent-300">Open →</Link>
          </Card>
        )}
        <Card title="Your security">
          <p className="text-[13px] text-zinc-500">Set up an authenticator app or link Google.</p>
          <Link to="/account" className="mt-3 inline-block text-[13px] font-medium text-accent-700 hover:underline dark:text-accent-300">Open →</Link>
        </Card>
      </div>
    </div>
  );
}
