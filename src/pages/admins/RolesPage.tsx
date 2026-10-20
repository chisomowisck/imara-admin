import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';
import { rolesApi, type PlatformRole } from '@/api/admins';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, cn } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { humanize } from '@/lib/format';

export function RolesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can('roles.manage');
  const roles = useQuery({ queryKey: ['platform-roles'], queryFn: rolesApi.list });
  const permissions = useQuery({ queryKey: ['platform-permissions'], queryFn: rolesApi.permissions });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ code: '', name: '', description: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions));
  }, [selected?.id, selected?.permissions.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const map = new Map<string, { code: string; description: string | null }[]>();
    permissions.data?.forEach((p) => map.set(p.group, [...(map.get(p.group) ?? []), p]));
    return [...map.entries()];
  }, [permissions.data]);

  const dirty = selected && [...draft].sort().join() !== [...selected.permissions].sort().join();
  const locked = !canManage || selected?.code === 'SUPER_ADMIN';

  const save = useMutation({
    mutationFn: () => rolesApi.update(selected!.id, { permissionCodes: [...draft] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-roles'] });
      toast.success('Role permissions saved (logged as a critical action)');
    },
    onError: toast.error,
  });
  const create = useMutation({
    mutationFn: () => rolesApi.create({ ...newRole, permissionCodes: [] }),
    onSuccess: (r: PlatformRole) => {
      qc.invalidateQueries({ queryKey: ['platform-roles'] });
      setCreating(false);
      setSelectedId(r.id);
      setNewRole({ code: '', name: '', description: '' });
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: () => rolesApi.remove(selected!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-roles'] });
      setSelectedId(null);
      setConfirmDelete(false);
    },
    onError: toast.error,
  });

  const toggle = (code: string) => {
    if (locked) return;
    const next = new Set(draft);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setDraft(next);
  };

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Platform roles for SmartTech staff. Every change is recorded as a critical audit event."
        actions={canManage && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New role</Button>}
      />
      <QueryState query={roles}>
        {(list) => (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <Card padded={false}>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {list.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setSelectedId(r.id)} className={cn('w-full px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50', selected?.id === r.id && 'bg-accent-50 dark:bg-accent-950/40')}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.name}</span>
                        {r.isSystem && <Badge>System</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500">{r.permissions.length} permissions · {r.adminCount} users</p>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            {selected && (
              <Card
                title={<span>{selected.name} <code className="ml-1 text-xs text-zinc-500">{selected.code}</code></span>}
                actions={
                  canManage && (
                    <>
                      {!selected.isSystem && <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)}>Delete</Button>}
                      <Button size="sm" disabled={!dirty || locked} loading={save.isPending} onClick={() => save.mutate()}>Save permissions</Button>
                    </>
                  )
                }
              >
                {selected.description && <p className="mb-3 text-[13px] text-zinc-500">{selected.description}</p>}
                {selected.code === 'SUPER_ADMIN' && (
                  <div className="mb-3"><Alert tone="info">The Super Administrator role always holds every permission.</Alert></div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groups.map(([group, perms]) => (
                    <div key={group} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                      <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">{humanize(group)}</p>
                      <div className="space-y-1.5">
                        {perms.map((p) => (
                          <label key={p.code} className={cn('flex items-start gap-2 text-[13px]', locked ? 'cursor-default' : 'cursor-pointer')}>
                            <input type="checkbox" className="mt-0.5 accent-accent-600" checked={draft.has(p.code)} disabled={locked} onChange={() => toggle(p.code)} />
                            <span>
                              <span className="font-mono text-xs">{p.code}</span>
                              {['tenants.restore', 'tenants.purge', 'roles.manage', 'config.secrets'].includes(p.code) && <ShieldAlert className="ml-1 inline size-3 text-amber-500" aria-label="Critical" />}
                              <span className="block text-xs text-zinc-500">{p.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </QueryState>

      <Modal open={creating} onClose={() => setCreating(false)} title="New platform role" size="sm" footer={
        <>
          <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!newRole.code || !newRole.name}>Create</Button>
        </>
      }>
        <div className="space-y-3">
          <Field label="Code" required hint="UPPER_SNAKE_CASE, e.g. COLLECTIONS">
            <Input value={newRole.code} onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
          </Field>
          <Field label="Name" required>
            <Input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete role" message={`Delete the role "${selected?.name}"? This is logged as a critical action.`} confirmLabel="Delete role" />
    </div>
  );
}
