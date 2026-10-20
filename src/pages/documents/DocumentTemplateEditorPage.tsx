import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronRight, History, Loader2, Plus, Printer, Save, X } from 'lucide-react';
import { documentTemplatesApi, LAYOUT_LABELS, type DocumentTemplate, type TemplateEditorInfo, type TemplateLayout, type TemplateSettings } from '@/api/documents';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, StatusBadge, Textarea, cn } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/lib/format';
import { VersionsModal } from './DocumentTemplatesPage';

const FONTS: TemplateSettings['font'][] = ['Helvetica', 'Inter', 'Georgia', 'Times', 'Verdana', 'Courier'];
const AUDIENCES = [
  { value: '', label: 'All organisations' },
  { value: 'MSME', label: 'MSME' },
  { value: 'NGO', label: 'NGO' },
  { value: 'GOV', label: 'GOV' },
];

const FIELD_LABELS: Record<keyof TemplateSettings['fields'], string> = {
  dueDate: 'Due date',
  reference: 'Reference',
  paymentTerms: 'Payment terms',
  status: 'Document status',
  taxNumbers: 'Tax numbers (TIN)',
  bankDetails: 'Bank details',
  amountInWords: 'Amount in words',
  qrCode: 'QR code',
};

const COLUMN_LABELS: Record<keyof TemplateSettings['columns'], string> = {
  lineNumber: 'Line number',
  code: 'Item code',
  quantity: 'Quantity',
  unit: 'Unit',
  unitPrice: 'Unit price',
  discount: 'Discount',
  taxRate: 'Tax rate',
  taxAmount: 'Tax amount',
  total: 'Line total',
};

const PLACEHOLDERS: { group: string; items: string[] }[] = [
  { group: 'Organisation', items: ['org.name', 'org.logo', 'org.addressLines[]', 'org.phone', 'org.email', 'org.website', 'org.taxNumber', 'org.bankAccounts[]', 'org.signature', 'org.stamp'] },
  { group: 'Document', items: ['title', 'document.number', 'document.date', 'document.dueDate', 'document.status', 'document.currency', 'document.reference', 'document.paymentTerms', 'document.meta[] {label, value}'] },
  { group: 'Party', items: ['party.label', 'party.name', 'party.lines[]', 'party.taxNumber', 'party.email', 'party.phone'] },
  { group: 'Lines and table', items: ['lines[] {no, code, description, quantity, unit, unitPrice, discount, taxRate, taxAmount, total}', 'table.headers[] {label, align}', 'table.rows[][] {value, align}'] },
  { group: 'Totals and payment', items: ['totals[] {label, amount, emphasis}', 'amountInWords', 'payment {method, reference, date, amount}'] },
  { group: 'Text and extras', items: ['notes', 'terms', 'footer', 'ledger[] {date, description, reference, debit, credit, balance}', 'qr', 'watermark'] },
];
const HELPERS = ['money', 'date', 'humanize', 'eq', 'and', 'or', 'not'];

interface Draft {
  documentType: string;
  name: string;
  description: string;
  layout: TemplateLayout;
  orgCategoryCode: string;
  countryCode: string;
  settings: TemplateSettings;
  customHtml: string;
  customCss: string;
}

function fromTemplate(t: DocumentTemplate, info: TemplateEditorInfo): Draft {
  const defaults = info.defaults[t.documentType];
  return {
    documentType: t.documentType,
    name: t.name,
    description: t.description ?? '',
    layout: t.layout,
    orgCategoryCode: t.orgCategoryCode ?? '',
    countryCode: t.countryCode ?? '',
    settings: mergeSettings(defaults, t.settings),
    customHtml: t.customHtml ?? (t.layout === 'CUSTOM_HTML' ? info.starterHtml : ''),
    customCss: t.customCss ?? '',
  };
}

/** Fills keys missing from stored settings with the type's defaults (the server does the same). */
function mergeSettings(defaults: TemplateSettings | undefined, stored: Partial<TemplateSettings> | undefined): TemplateSettings {
  const d = defaults ?? ({} as TemplateSettings);
  const s = (stored ?? {}) as Partial<TemplateSettings>;
  return {
    page: { ...d.page, ...s.page },
    colors: { ...d.colors, ...s.colors },
    font: s.font ?? d.font,
    header: { ...d.header, ...s.header },
    fields: { ...d.fields, ...s.fields },
    columns: { ...d.columns, ...s.columns },
    text: { ...d.text, ...s.text },
    signatures: { ...d.signatures, ...s.signatures, labels: s.signatures?.labels ?? d.signatures?.labels ?? [] },
    watermark: { ...d.watermark, ...s.watermark },
  };
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button type="button" className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title}
        {open ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
      </button>
      {open && <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-800">{children}</div>}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" className="accent-accent-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Colour picker where '' means "use the organisation's branding colour". */
function BrandColor({ label, value, onChange, allowBranding = true }: { label: string; value: string; onChange: (v: string) => void; allowBranding?: boolean }) {
  const useBranding = allowBranding && !value;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} className="h-9 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900" value={value || '#0d9488'} disabled={useBranding} onChange={(e) => onChange(e.target.value)} />
        <Input className="w-28 font-mono" value={value} placeholder={allowBranding ? 'Branding' : '#111827'} onChange={(e) => onChange(e.target.value.trim())} />
        {allowBranding && <Check label="Use branding" checked={useBranding} onChange={(v) => onChange(v ? '' : '#0d9488')} />}
      </div>
    </Field>
  );
}

function PlaceholderHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 text-[12px] dark:border-zinc-800 dark:bg-zinc-900/60">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 font-medium" onClick={() => setOpen((o) => !o)}>
        Placeholders and helpers
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <p className="text-zinc-600 dark:text-zinc-400">
            Handlebars syntax: <code className="font-mono">{'{{org.name}}'}</code>, loops with <code className="font-mono">{'{{#each table.rows}}…{{/each}}'}</code>. Scripts and remote URLs are removed when the template is rendered.
          </p>
          {PLACEHOLDERS.map((g) => (
            <div key={g.group}>
              <p className="font-semibold">{g.group}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {g.items.map((i) => <code key={i} className="rounded bg-white px-1 py-0.5 font-mono text-[11px] ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">{i}</code>)}
              </div>
            </div>
          ))}
          <div>
            <p className="font-semibold">Helpers</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {HELPERS.map((h) => <code key={h} className="rounded bg-white px-1 py-0.5 font-mono text-[11px] ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">{h}</code>)}
            </div>
            <p className="mt-1 text-zinc-500">e.g. <code className="font-mono">{'{{money amount}}'}</code>, <code className="font-mono">{'{{date document.date}}'}</code>, <code className="font-mono">{'{{#if (eq document.status "PAID")}}'}</code></p>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsForm({ draft, setDraft, layouts, starterHtml }: { draft: Draft; setDraft: (d: Draft) => void; layouts: TemplateLayout[]; starterHtml: string }) {
  const s = draft.settings;
  const set = <K extends Exclude<keyof TemplateSettings, 'font'>>(key: K, patch: Partial<TemplateSettings[K]>) =>
    setDraft({ ...draft, settings: { ...s, [key]: { ...s[key], ...patch } } });
  const labels = s.signatures.labels;
  return (
    <div className="space-y-3">
      <Section title="Template">
        <Field label="Name" required>
          <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea value={draft.description} maxLength={500} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Layout" required>
            <Select
              value={draft.layout}
              onChange={(e) => {
                const layout = e.target.value as TemplateLayout;
                setDraft({ ...draft, layout, customHtml: layout === 'CUSTOM_HTML' && !draft.customHtml.trim() ? starterHtml : draft.customHtml });
              }}
            >
              {layouts.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l] ?? l}</option>)}
            </Select>
          </Field>
          <Field label="Audience" hint="Which organisations see it in their gallery once published.">
            <Select value={draft.orgCategoryCode} onChange={(e) => setDraft({ ...draft, orgCategoryCode: e.target.value })}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      {draft.layout === 'CUSTOM_HTML' && (
        <Section title="Custom HTML">
          <Field label="HTML (Handlebars)" required>
            <Textarea className="min-h-80 font-mono text-xs" spellCheck={false} value={draft.customHtml} onChange={(e) => setDraft({ ...draft, customHtml: e.target.value })} />
          </Field>
          <Field label="CSS" hint="Optional. Applied after the built-in print styles.">
            <Textarea className="min-h-32 font-mono text-xs" spellCheck={false} value={draft.customCss} onChange={(e) => setDraft({ ...draft, customCss: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, customHtml: starterHtml })}>Reset to starter HTML</Button>
          </div>
          <PlaceholderHelp />
        </Section>
      )}

      <Section title="Page">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Paper size">
            <Select value={s.page.size} onChange={(e) => set('page', { size: e.target.value as TemplateSettings['page']['size'] })}>
              <option value="A4">A4</option>
              <option value="LETTER">Letter</option>
              <option value="A5">A5</option>
            </Select>
          </Field>
          <Field label="Orientation">
            <Select value={s.page.orientation} onChange={(e) => set('page', { orientation: e.target.value as TemplateSettings['page']['orientation'] })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </Select>
          </Field>
          <Field label="Margin (mm)" hint="0–40">
            <Input type="number" min={0} max={40} value={s.page.marginMm} onChange={(e) => set('page', { marginMm: Math.min(40, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
        </div>
      </Section>

      <Section title="Colours and font">
        <BrandColor label="Primary colour" value={s.colors.primary} onChange={(v) => set('colors', { primary: v })} />
        <BrandColor label="Accent colour" value={s.colors.accent} onChange={(v) => set('colors', { accent: v })} />
        <BrandColor label="Text colour" value={s.colors.text} allowBranding={false} onChange={(v) => set('colors', { text: v })} />
        <Field label="Font">
          <Select value={s.font} onChange={(e) => setDraft({ ...draft, settings: { ...s, font: e.target.value as TemplateSettings['font'] } })}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </Field>
      </Section>

      <Section title="Header">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo position">
            <Select value={s.header.logoPosition} onChange={(e) => set('header', { logoPosition: e.target.value as TemplateSettings['header']['logoPosition'] })}>
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
              <option value="none">No logo</option>
            </Select>
          </Field>
          <Field label="Header style">
            <Select value={s.header.style} onChange={(e) => set('header', { style: e.target.value as TemplateSettings['header']['style'] })}>
              <option value="plain">Plain</option>
              <option value="band">Colour band</option>
              <option value="boxed">Boxed</option>
            </Select>
          </Field>
        </div>
        <Field label="Document title" hint="Leave empty to use the default title for the document type.">
          <Input value={s.header.title} maxLength={60} onChange={(e) => set('header', { title: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Check label="Show letterhead image" checked={s.header.showLetterhead} onChange={(v) => set('header', { showLetterhead: v })} />
          <Check label="Show organisation details" checked={s.header.showOrgDetails} onChange={(v) => set('header', { showOrgDetails: v })} />
        </div>
      </Section>

      <Section title="Fields shown">
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(FIELD_LABELS) as (keyof TemplateSettings['fields'])[]).map((k) => (
            <Check key={k} label={FIELD_LABELS[k]} checked={!!s.fields[k]} onChange={(v) => set('fields', { [k]: v })} />
          ))}
        </div>
      </Section>

      <Section title="Line item columns">
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(COLUMN_LABELS) as (keyof TemplateSettings['columns'])[]).map((k) => (
            <Check key={k} label={COLUMN_LABELS[k]} checked={!!s.columns[k]} onChange={(v) => set('columns', { [k]: v })} />
          ))}
        </div>
      </Section>

      <Section title="Text" defaultOpen={false}>
        <Field label="Notes"><Textarea value={s.text.notes} maxLength={4000} onChange={(e) => set('text', { notes: e.target.value })} /></Field>
        <Field label="Terms and conditions"><Textarea value={s.text.terms} maxLength={4000} onChange={(e) => set('text', { terms: e.target.value })} /></Field>
        <Field label="Footer"><Textarea value={s.text.footer} maxLength={1000} onChange={(e) => set('text', { footer: e.target.value })} /></Field>
      </Section>

      <Section title="Signatures" defaultOpen={false}>
        <Check label="Show signature lines" checked={s.signatures.enabled} onChange={(v) => set('signatures', { enabled: v })} />
        {s.signatures.enabled && (
          <>
            <div className="space-y-2">
              {labels.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={l} maxLength={40} placeholder="e.g. Approved by" onChange={(e) => set('signatures', { labels: labels.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <Button type="button" size="sm" variant="ghost" aria-label="Remove signature line" onClick={() => set('signatures', { labels: labels.filter((_, j) => j !== i) })}><X className="size-3.5" /></Button>
                </div>
              ))}
              {labels.length < 4 && (
                <Button type="button" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => set('signatures', { labels: [...labels, ''] })}>Add signature line</Button>
              )}
              <p className="text-xs text-zinc-500">Up to 4 lines. Empty lines are dropped when saved.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Check label="Print signature image" checked={s.signatures.showSignatureImage} onChange={(v) => set('signatures', { showSignatureImage: v })} />
              <Check label="Print stamp" checked={s.signatures.showStamp} onChange={(v) => set('signatures', { showStamp: v })} />
            </div>
          </>
        )}
      </Section>

      <Section title="Watermark" defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mode">
            <Select value={s.watermark.mode} onChange={(e) => set('watermark', { mode: e.target.value as TemplateSettings['watermark']['mode'] })}>
              <option value="none">None</option>
              <option value="status">Document status (e.g. PAID, DRAFT)</option>
              <option value="custom">Custom text</option>
            </Select>
          </Field>
          {s.watermark.mode === 'custom' && (
            <Field label="Watermark text">
              <Input value={s.watermark.text} maxLength={30} onChange={(e) => set('watermark', { text: e.target.value })} />
            </Field>
          )}
        </div>
      </Section>
    </div>
  );
}

function PreviewPane({ draft }: { draft: Draft }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const body = useMemo(
    () => ({
      documentType: draft.documentType,
      layout: draft.layout,
      settings: draft.settings,
      ...(draft.layout === 'CUSTOM_HTML' ? { customHtml: draft.customHtml, customCss: draft.customCss || undefined } : {}),
    }),
    [draft.documentType, draft.layout, draft.settings, draft.customHtml, draft.customCss],
  );
  const debounced = useDebounce(body, 400);
  const preview = useQuery({
    queryKey: ['document-templates', 'preview', debounced],
    queryFn: () => documentTemplatesApi.preview(debounced),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });
  const html = preview.data?.html;
  return (
    <Card
      padded={false}
      title={<span className="flex items-center gap-2">Live preview {preview.isFetching && <Loader2 className="size-3.5 animate-spin text-zinc-400" />}</span>}
      actions={<Button size="sm" variant="secondary" icon={<Printer className="size-3.5" />} disabled={!html} onClick={() => frame.current?.contentWindow?.print()}>Print preview</Button>}
    >
      {preview.isError && (
        <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
          <Alert tone="danger" title={preview.error instanceof ApiError && preview.error.code === 'TEMPLATE_SYNTAX_ERROR' ? 'Template error' : 'Preview failed'}>
            {preview.error instanceof Error ? preview.error.message : 'Could not render the preview.'}
          </Alert>
        </div>
      )}
      {html ? (
        <iframe ref={frame} title="Template preview" sandbox="allow-same-origin allow-modals" srcDoc={html} className="h-[calc(100vh-14rem)] min-h-[480px] w-full bg-white" />
      ) : preview.isLoading ? (
        <LoadingState label="Rendering preview…" />
      ) : null}
      <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        Rendered with sample data and a sample organisation. Real organisations' branding replaces it. To save as PDF, use Print preview and choose "Save as PDF".
      </p>
    </Card>
  );
}

export function DocumentTemplateEditorPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('config.manage');
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? null : Number(params.id);

  const editor = useQuery({ queryKey: ['document-templates', 'editor'], queryFn: documentTemplatesApi.editor, staleTime: 5 * 60_000 });
  const template = useQuery({ queryKey: ['document-templates', id], queryFn: () => documentTemplatesApi.get(id!), enabled: id !== null });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);

  // Initialise the draft once the editor info (and template) has loaded.
  useEffect(() => {
    if (!editor.data || draft) return;
    let d: Draft | null = null;
    if (isNew) {
      const type = search.get('type') ?? '';
      const def = editor.data.types.find((t) => t.code === type);
      if (!def) return;
      const layout = (editor.data.layouts.includes(search.get('layout') as TemplateLayout) ? search.get('layout') : 'CLASSIC') as TemplateLayout;
      d = {
        documentType: def.code,
        name: `${def.name} – ${LAYOUT_LABELS[layout] ?? layout}`,
        description: '',
        layout,
        orgCategoryCode: '',
        countryCode: '',
        settings: mergeSettings(editor.data.defaults[def.code], undefined),
        customHtml: layout === 'CUSTOM_HTML' ? editor.data.starterHtml : '',
        customCss: '',
      };
    } else if (template.data) {
      d = fromTemplate(template.data, editor.data);
    }
    if (d) {
      setDraft(d);
      setInitial(JSON.stringify(d));
    }
  }, [editor.data, template.data, draft, isNew, search]);

  const dirty = !!draft && JSON.stringify(draft) !== initial;

  const save = useMutation({
    mutationFn: () => {
      const d = draft!;
      const body = {
        name: d.name.trim(),
        description: d.description,
        layout: d.layout,
        settings: { ...d.settings, signatures: { ...d.settings.signatures, labels: d.settings.signatures.labels.filter((l) => l.trim()) } },
        customHtml: d.layout === 'CUSTOM_HTML' ? d.customHtml : d.customHtml || undefined,
        customCss: d.customCss || (d.layout === 'CUSTOM_HTML' ? '' : undefined),
        orgCategoryCode: d.orgCategoryCode,
        // The backend clears countryCode when only orgCategoryCode is sent, so always send both.
        countryCode: d.countryCode,
      };
      return id === null ? documentTemplatesApi.create({ ...body, documentType: d.documentType }) : documentTemplatesApi.update(id, { ...body, changeNote: note.trim() || undefined });
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success(id === null ? 'Draft template created' : `Saved as version ${t.version}`);
      setSaving(false);
      setNote('');
      if (id === null) {
        navigate(`/documents/${t.id}`, { replace: true });
      } else {
        qc.setQueryData(['document-templates', id], t);
        const d = editor.data ? fromTemplate(t, editor.data) : draft!;
        setDraft(d);
        setInitial(JSON.stringify(d));
      }
    },
    onError: toast.error,
  });

  const reloadAfterRestore = async () => {
    const res = await template.refetch();
    if (res.data && editor.data) {
      const d = fromTemplate(res.data, editor.data);
      setDraft(d);
      setInitial(JSON.stringify(d));
    }
  };

  if (editor.isError) return <ErrorState error={editor.error} onRetry={() => editor.refetch()} />;
  if (template.isError) return <ErrorState error={template.error} onRetry={() => template.refetch()} />;
  if (isNew && editor.data && !editor.data.types.some((t) => t.code === search.get('type'))) {
    return <ErrorState error={new Error('Choose a document type from the templates list to start a new template.')} onRetry={() => navigate('/documents')} />;
  }
  if (isNew && !manage) return <Alert tone="warning">Your role can view templates but not create them.</Alert>;
  if (!draft || !editor.data) return <LoadingState />;

  const typeInfo = editor.data.types.find((t) => t.code === draft.documentType);
  const t = template.data;
  const canSave = manage && !!draft.name.trim() && (draft.layout !== 'CUSTOM_HTML' || !!draft.customHtml.trim());

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/documents" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" /> Document templates</Link>}
        title={isNew ? 'New template' : draft.name || 'Template'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {typeInfo?.name ?? draft.documentType}
            {typeInfo && <Badge>{typeInfo.group}</Badge>}
            {typeInfo && !typeInfo.printable && <Badge tone="warning">Design only</Badge>}
            {t ? <StatusBadge status={t.status} /> : <Badge>New draft</Badge>}
            {t?.isDefault && <Badge tone="accent">Default</Badge>}
            {t && <span className="text-xs">v{t.version} · updated {formatDateTime(t.updatedAt)}</span>}
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </span>
        }
        actions={
          <>
            {t && <Button variant="secondary" icon={<History className="size-4" />} onClick={() => setVersionsOpen(true)}>Versions</Button>}
            {manage && (
              <Button icon={<Save className="size-4" />} disabled={!canSave || (!isNew && !dirty)} loading={isNew && save.isPending} onClick={() => (isNew ? save.mutate() : setSaving(true))}>
                {isNew ? 'Create draft' : 'Save'}
              </Button>
            )}
          </>
        }
      />
      {!manage && (
        <div className="mb-4">
          <Alert tone="info">Read-only. Your role can view platform templates but not change them.</Alert>
        </div>
      )}
      {(draft.documentType === 'SUBSCRIPTION_INVOICE' || draft.documentType === 'SUBSCRIPTION_RECEIPT') && (
        <div className="mb-4">
          <Alert tone="info">Used for SmartTech's invoices to clients; the emailed PDF uses this template's primary colour, title and footer.</Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <fieldset disabled={!manage} className={cn('min-w-0', !manage && 'opacity-90')}>
          <SettingsForm draft={draft} setDraft={setDraft} layouts={editor.data.layouts} starterHtml={editor.data.starterHtml} />
        </fieldset>
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <PreviewPane draft={draft} />
        </div>
      </div>

      <Modal
        open={saving}
        onClose={() => setSaving(false)}
        title="Save template"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaving(false)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save new version</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Change note" hint="Shown in the version history. Optional, up to 200 characters.">
            <Textarea value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What changed?" autoFocus />
          </Field>
          {t?.status === 'PUBLISHED' && <Alert tone="info">This template is published. Organisations see the new version in their gallery right away; copies they already made do not change.</Alert>}
        </div>
      </Modal>
      {t && <VersionsModal templateId={versionsOpen ? t.id : null} name={t.name} onClose={() => setVersionsOpen(false)} onRestored={reloadAfterRestore} />}
    </div>
  );
}
