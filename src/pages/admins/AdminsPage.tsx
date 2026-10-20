import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { adminsApi, rolesApi, type PlatformAdminRow } from '@/api/admins';
import { useAuth } from '@/auth/AuthContext';
import { Can } from '@/auth/guards';
import { DataTable, type SortState } from '@/components/table/DataTable';
import { Alert, Badge, Button, DescriptionList, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime, fullName, timeAgo } from '@/lib/format';

type ReasonAction = 'suspend' | 'reactivate' | 'reset-mfa' | 'revoke-sessions';
const ACTION_COPY: Record<ReasonAction, { title: string; label: string; tone: 'danger' | 'primary' | 'warning'; description: string }> = {
  suspend: { title: 'Suspend platform user', label: 'Suspend', tone: 'danger', description: 'They are signed out everywhere and cannot sign in until reactivated.' },
  reactivate: { title: 'Reactivate platform user', label: 'Reactivate', tone: 'primary', description: 'They will be able to sign in again.' },
  'reset-mfa': { title: 'Reset multi-factor authentication', label: 'Reset MFA', tone: 'warning', description: 'Removes their authenticator app and recovery codes. They fall back to email codes and are signed out.' },
  'revoke-sessions': { title: 'Sign out everywhere', label: 'Revoke sessions', tone: 'warning', description: 'Ends every active session for this user.' },
};

function AdminForm({ initial, onClose }: { initial?: PlatformAdminRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const roles = useQuery({ queryKey: ['platform-roles'], queryFn: rolesApi.list });
  const [form, setForm] = useState({
    email: initial?.email ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    phone: initial?.phone ?? '',
    roleCodes: initial?.roles.map((r) => r.code) ?? ['READ_ONLY'],
  });
  const [devLink, setDevLink] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (initial) return adminsApi.update(initial.id, { firstName: form.firstName, lastName: form.lastName, phone: form.phone || undefined, roleCodes: form.roleCodes });
      const created = await adminsApi.create({ ...form, phone: form.phone || undefined });
      if (created.invitation?.devLink) setDevLink(created.invitation.devLink);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-admins'] });
      toast.success(initial ? 'Platform user updated' : 'Invitation sent');
      if (initial) onClose();
    },
    onError: toast.error,
  });
  const toggleRole = (code: string) =>
    setForm((f) => ({ ...f, roleCodes: f.roleCodes.includes(code) ? f.roleCodes.filter((c) => c !== code) : [...f.roleCodes, code] }));

  if (devLink) {
    return (
      <div className="space-y-3">
        <Alert tone="success" title="Invitation created">An email with a set-password link was sent to {form.email}.</Alert>
        <Alert tone="info" title="Development only">Email may not be delivered locally. Set-password link: <code className="break-all">{devLink}</code></Alert>
        <Button onClick={onClose}>Done</Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Email" required>
        <Input type="email" value={form.email} disabled={!!initial} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required>
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </Field>
        <Field label="Last name" required>
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </Field>
      </div>
      <Field label="Phone">
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Roles" required hint="Changing roles is logged as a critical action.">
        <div className="space-y-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          {roles.data?.map((r) => (
            <label key={r.code} className="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <input type="checkbox" className="mt-0.5 accent-accent-600" checked={form.roleCodes.includes(r.code)} onChange={() => toggleRole(r.code)} />
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-zinc-500">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!form.roleCodes.length}>{initial ? 'Save changes' : 'Send invitation'}</Button>
      </div>
    </form>
  );
}

function AdminDetail({ admin, onClose }: { admin: PlatformAdminRow; onClose: () => void }) {
  const history = useQuery({ queryKey: ['platform-admin-history', admin.id], queryFn: () => adminsApi.loginHistory(admin.id) });
  return (
    <div className="space-y-4">
      <DescriptionList
        items={[
          { label: 'Email', value: admin.email },
          { label: 'Status', value: <StatusBadge status={admin.status} /> },
          { label: 'Roles', value: admin.roles.map((r) => r.name).join(', ') },
          { label: 'MFA', value: admin.totpEnabled ? 'Authenticator app' : 'Email code' },
          { label: 'Google', value: admin.identities.find((i) => i.provider === 'GOOGLE')?.email ?? 'Not linked' },
          { label: 'Last sign-in', value: formatDateTime(admin.lastLoginAt) },
        ]}
      />
      <div>
        <h3 className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Recent sign-in attempts</h3>
        <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          {history.data?.length ? (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td className="px-2 py-1.5">{formatDateTime(h.createdAt)}</td>
                    <td className="px-2 py-1.5">{h.method}</td>
                    <td className="px-2 py-1.5">{h.success ? <Badge tone="success">OK</Badge> : <Badge tone="danger">{h.failureReason}</Badge>}</td>
                    <td className="px-2 py-1.5">{h.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-3 text-xs text-zinc-500">{history.isLoading ? 'Loading…' : 'No sign-in attempts yet.'}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

export function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { admin: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const debounced = useDebounce(search);
  const [editing, setEditing] = useState<PlatformAdminRow | 'new' | null>(null);
  const [viewing, setViewing] = useState<PlatformAdminRow | null>(null);
  const [pending, setPending] = useState<{ action: ReasonAction; admin: PlatformAdminRow } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);

  const params = { page, limit: 20, search: debounced, status, role };
  const list = useQuery({ queryKey: ['platform-admins', params], queryFn: () => adminsApi.list(params) });
  const roles = useQuery({ queryKey: ['platform-roles'], queryFn: rolesApi.list });

  const act = useMutation({
    mutationFn: ({ action, id, reason }: { action: ReasonAction; id: number; reason: string }) =>
      action === 'suspend' ? adminsApi.suspend(id, reason)
        : action === 'reactivate' ? adminsApi.reactivate(id, reason)
          : action === 'reset-mfa' ? adminsApi.resetMfa(id, reason)
            : adminsApi.revokeSessions(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-admins'] });
      toast.success('Done');
      setPending(null);
    },
    onError: toast.error,
  });
  const sendReset = useMutation({
    mutationFn: (id: number) => adminsApi.sendPasswordReset(id),
    onSuccess: (r) => toast.success(r.devLink ? `Reset link sent (dev link logged on the server)` : 'Password reset link sent'),
    onError: toast.error,
  });

  return (
    <div>
      <PageHeader
        title="Platform users"
        description="SmartTech staff accounts. Completely separate from tenant users."
        actions={
          <Can all={['admins.manage']}>
            <Button icon={<UserPlus className="size-4" />} onClick={() => setEditing('new')}>Invite user</Button>
          </Can>
        }
      />
      <DataTable
        rows={list.data?.data}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        rowKey={(r) => r.id}
        pagination={list.data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search name or email…"
        onRowClick={setViewing}
        filters={
          <>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36" aria-label="Status">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="LOCKED">Locked</option>
            </Select>
            <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="w-44" aria-label="Role">
              <option value="">All roles</option>
              {roles.data?.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
          </>
        }
        exportConfig={{ fileBase: 'platform-users', title: 'Platform users', generatedBy: me?.email, fetchAll: async () => (await adminsApi.list({ ...params, page: 1, limit: 100 })).data }}
        columns={[
          { id: 'name', header: 'Name', cell: (r) => <div><p className="font-medium">{fullName(r)}</p><p className="text-xs text-zinc-500">{r.email}</p></div>, value: (r) => fullName(r), sortable: true },
          { id: 'email', header: 'Email', cell: () => null, value: (r) => r.email, className: 'hidden' },
          { id: 'roles', header: 'Roles', cell: (r) => <div className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x.code} tone={x.code === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>{x.name}</Badge>)}</div>, value: (r) => r.roles.map((x) => x.name).join(', ') },
          { id: 'status', header: 'Status', cell: (r) => <div className="flex items-center gap-1"><StatusBadge status={r.status} />{r.invitationPending && <Badge tone="warning">Invited</Badge>}</div>, value: (r) => r.status, sortable: true },
          { id: 'mfa', header: 'MFA', cell: (r) => (r.totpEnabled ? 'Authenticator' : 'Email code'), value: (r) => (r.totpEnabled ? 'Authenticator' : 'Email code'), hideOnMobile: true },
          { id: 'last', header: 'Last sign-in', cell: (r) => timeAgo(r.lastLoginAt), value: (r) => r.lastLoginAt, sortable: true, hideOnMobile: true },
          {
            id: 'actions', header: '', exportable: false, className: 'w-10 text-right', cell: (r) => (
              <Can all={['admins.manage']}>
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" aria-label="Actions" onClick={() => setMenu(menu === r.id ? null : r.id)}><MoreHorizontal className="size-4" /></Button>
                  {menu === r.id && (
                    <div className="card absolute right-0 z-20 mt-1 w-48 p-1 text-left shadow-lg" onMouseLeave={() => setMenu(null)}>
                      {[
                        { label: 'Edit', run: () => setEditing(r) },
                        { label: 'Send password reset', run: () => sendReset.mutate(r.id) },
                        { label: 'Reset MFA', run: () => setPending({ action: 'reset-mfa', admin: r }) },
                        { label: 'Sign out everywhere', run: () => setPending({ action: 'revoke-sessions', admin: r }) },
                        r.status === 'ACTIVE'
                          ? { label: 'Suspend', run: () => setPending({ action: 'suspend', admin: r }), danger: true, hidden: r.id === me?.id }
                          : { label: 'Reactivate', run: () => setPending({ action: 'reactivate', admin: r }) },
                      ].filter((i) => !('hidden' in i && i.hidden)).map((i) => (
                        <button key={i.label} className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 ${'danger' in i && i.danger ? 'text-red-600' : ''}`} onClick={() => { setMenu(null); i.run(); }}>
                          {i.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Can>
            ),
          },
        ]}
      />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Invite platform user' : 'Edit platform user'}>
        {editing && <AdminForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? fullName(viewing) : ''} size="lg">
        {viewing && <AdminDetail admin={viewing} onClose={() => setViewing(null)} />}
      </Modal>
      {pending && (
        <ReasonDialog
          open
          onClose={() => setPending(null)}
          title={ACTION_COPY[pending.action].title}
          description={<><b>{fullName(pending.admin)}</b> ({pending.admin.email}). {ACTION_COPY[pending.action].description}</>}
          confirmLabel={ACTION_COPY[pending.action].label}
          tone={ACTION_COPY[pending.action].tone}
          loading={act.isPending}
          onConfirm={(reason) => act.mutate({ action: pending.action, id: pending.admin.id, reason })}
        />
      )}
    </div>
  );
}
