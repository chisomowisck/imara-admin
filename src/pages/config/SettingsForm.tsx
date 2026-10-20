import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Undo2 } from 'lucide-react';
import { configApi } from '@/api/platform';
import { Badge, Button, Card, Field, Input, Select, Textarea, cn } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export type SettingFieldType = 'text' | 'number' | 'checkbox' | 'select' | 'list' | 'secret' | 'datetime' | 'textarea';

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  /** Never editable and never sent (e.g. base currency). */
  readOnly?: boolean;
  /** For type 'list': parse entries as numbers. */
  numeric?: boolean;
  /** For type 'number': input step. */
  step?: string;
  min?: number;
  /** Span both grid columns. */
  full?: boolean;
  /** Hide the field depending on the current draft. */
  visible?: (draft: Draft) => boolean;
}

export interface SettingHeading {
  heading: string;
  description?: ReactNode;
  visible?: (draft: Draft) => boolean;
}

export type SettingItem = SettingField | SettingHeading;
export type Draft = Record<string, string | boolean>;

const isHeading = (i: SettingItem): i is SettingHeading => 'heading' in i;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** ISO string -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDraftValue(field: SettingField, value: unknown): string | boolean {
  switch (field.type) {
    case 'checkbox':
      return value === true || value === 'true';
    case 'list':
      return Array.isArray(value) ? value.join(', ') : '';
    case 'datetime':
      return toLocalInput(value);
    case 'secret':
      return ''; // secrets are never pre-filled
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

function fromDraftValue(field: SettingField, draft: string | boolean): unknown {
  switch (field.type) {
    case 'checkbox':
      return Boolean(draft);
    case 'number':
      return draft === '' ? null : Number(draft);
    case 'list': {
      const parts = String(draft)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return field.numeric ? parts.map(Number) : parts;
    }
    case 'datetime':
      return draft ? new Date(String(draft)).toISOString() : null;
    default:
      return String(draft);
  }
}

function buildDraft(fields: SettingField[], values: Record<string, unknown>): Draft {
  const d: Draft = {};
  for (const f of fields) d[f.key] = toDraftValue(f, values[f.key]);
  return d;
}

export function SettingsForm({
  category,
  values,
  items,
  canEdit,
  title,
  description,
  extra,
  confirmBeforeSave,
  saveLabel = 'Save changes',
}: {
  category: string;
  values: Record<string, unknown>;
  items: SettingItem[];
  canEdit: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** Rendered below the fields; receives the live draft (previews, warnings…). */
  extra?: (draft: Draft) => ReactNode;
  /** Return a confirmation to show before saving, or null to save straight away. */
  confirmBeforeSave?: (patch: Record<string, unknown>, draft: Draft) => { title: string; message: ReactNode; confirmLabel?: string } | null;
  saveLabel?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const fields = items.filter((i): i is SettingField => !isHeading(i));
  // Keyed by content so inline item/value objects don't reset the draft on every render.
  const initialKey = JSON.stringify(buildDraft(fields, values));
  const initial = useMemo(() => JSON.parse(initialKey) as Draft, [initialKey]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, setPending] = useState<{ patch: Record<string, unknown>; title: string; message: ReactNode; confirmLabel?: string } | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const changedKeys = fields.filter((f) => !f.readOnly && draft[f.key] !== initial[f.key]).map((f) => f.key);
  const dirty = changedKeys.length > 0;

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => configApi.saveSettings(category, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-settings'] });
      setPending(null);
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      if (!changedKeys.includes(f.key)) continue;
      const v = fromDraftValue(f, draft[f.key]);
      if (f.type === 'number' && (v === null || !Number.isFinite(v as number))) {
        toast.error(`${f.label} must be a number`);
        return;
      }
      if (f.type === 'list' && f.numeric && (v as number[]).some((n) => !Number.isFinite(n))) {
        toast.error(`${f.label} must be a comma-separated list of numbers`);
        return;
      }
      patch[f.key] = v;
    }
    const confirm = confirmBeforeSave?.(patch, draft);
    if (confirm) setPending({ patch, ...confirm });
    else save.mutate(patch);
  };

  const set = (key: string, v: string | boolean) => setDraft((d) => ({ ...d, [key]: v }));

  const renderField = (f: SettingField) => {
    const disabled = !canEdit || f.readOnly;
    const value = draft[f.key];
    const changed = changedKeys.includes(f.key);
    const className = cn((f.full || f.type === 'textarea') && 'sm:col-span-2');
    if (f.type === 'checkbox') {
      return (
        <div key={f.key} className={cn(className, 'flex flex-col justify-center')}>
          <label className={cn('flex items-center gap-2 text-[13px]', disabled ? 'opacity-70' : 'cursor-pointer')}>
            <input type="checkbox" className="accent-accent-600" checked={Boolean(value)} disabled={disabled} onChange={(e) => set(f.key, e.target.checked)} />
            <span className="font-medium">{f.label}</span>
            {changed && <Badge tone="warning">Changed</Badge>}
          </label>
          {f.hint && <p className="mt-1 ml-6 text-xs text-zinc-500">{f.hint}</p>}
        </div>
      );
    }
    let hint = f.hint;
    if (f.type === 'secret') {
      const mask = values[f.key];
      const isSet = Boolean(values[`${f.key}Set`]);
      hint = `${isSet ? `Current: ${typeof mask === 'string' && mask ? mask : 'set'}` : 'Not set'} · leave empty to keep the current value.${f.hint ? ` ${f.hint}` : ''}`;
    }
    let control: ReactNode;
    switch (f.type) {
      case 'select':
        control = (
          <Select value={String(value)} disabled={disabled} onChange={(e) => set(f.key, e.target.value)}>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
        break;
      case 'textarea':
        control = <Textarea value={String(value)} disabled={disabled} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
        break;
      case 'secret':
        control = (
          <Input
            type="password"
            autoComplete="new-password"
            value={String(value)}
            disabled={disabled}
            placeholder={values[`${f.key}Set`] ? 'Enter a new value to replace' : 'Enter a value'}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
        break;
      default:
        control = (
          <Input
            type={f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'}
            step={f.step}
            min={f.min}
            value={String(value)}
            disabled={disabled}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
    }
    return (
      <Field key={f.key} label={changed ? `${f.label} •` : f.label} hint={hint} className={className}>
        {control}
      </Field>
    );
  };

  // Group items under headings.
  const groups: { heading?: SettingHeading; fields: SettingField[] }[] = [];
  for (const i of items) {
    if (isHeading(i)) groups.push({ heading: i, fields: [] });
    else {
      if (!groups.length) groups.push({ fields: [] });
      groups[groups.length - 1].fields.push(i);
    }
  }

  return (
    <Card
      title={title}
      actions={
        canEdit && dirty ? (
          <Badge tone="warning">
            {changedKeys.length} unsaved change{changedKeys.length === 1 ? '' : 's'}
          </Badge>
        ) : !canEdit ? (
          <Badge>Read only</Badge>
        ) : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {description && <div className="text-[13px] text-zinc-600 dark:text-zinc-400">{description}</div>}
        {groups
          .filter((g) => !g.heading?.visible || g.heading.visible(draft))
          .map((g, gi) => (
            <div key={g.heading?.heading ?? gi} className={cn(g.heading && 'border-t border-zinc-100 pt-4 first:border-0 first:pt-0 dark:border-zinc-800')}>
              {g.heading && (
                <div className="mb-3">
                  <h3 className="text-[13px] font-semibold">{g.heading.heading}</h3>
                  {g.heading.description && <div className="mt-0.5 text-xs text-zinc-500">{g.heading.description}</div>}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">{g.fields.filter((f) => !f.visible || f.visible(draft)).map(renderField)}</div>
            </div>
          ))}
        {extra?.(draft)}
        {canEdit && (
          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <Button type="button" variant="secondary" icon={<Undo2 className="size-3.5" />} disabled={!dirty || save.isPending} onClick={() => setDraft(initial)}>
              Discard
            </Button>
            <Button type="submit" icon={<Save className="size-3.5" />} disabled={!dirty} loading={save.isPending && !pending}>
              {saveLabel}
            </Button>
          </div>
        )}
      </form>
      {pending && (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          onConfirm={() => save.mutate(pending.patch)}
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel ?? 'Save'}
          tone="warning"
          loading={save.isPending}
        />
      )}
    </Card>
  );
}
