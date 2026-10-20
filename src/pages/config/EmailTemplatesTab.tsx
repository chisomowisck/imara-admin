import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, RotateCcw, Save, Send } from 'lucide-react';
import { configApi } from '@/api/platform';
import { Badge, Button, Card, Field, Input, Textarea, cn } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';

type EmailTemplate = Awaited<ReturnType<typeof configApi.emailTemplates>>[number];

const BRANDING_VARS = ['platformName', 'supportEmail', 'supportPhone', 'termsUrl', 'privacyUrl'];

function TemplateEditor({ template, canEdit }: { template: EmailTemplate; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [html, setHtml] = useState(template.html);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testTo, setTestTo] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'subject' | 'html'>('html');

  useEffect(() => {
    setSubject(template.subject);
    setHtml(template.html);
  }, [template.subject, template.html]);

  const dirty = subject !== template.subject || html !== template.html;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['config-email-templates'] });

  const doPreview = useMutation({
    mutationFn: () => configApi.previewEmailTemplate(template.key, { subject, html }),
    onSuccess: (r) => setPreview({ subject: r.subject, html: r.html }),
    onError: (e) => toast.error(e),
  });
  const save = useMutation({
    mutationFn: () => configApi.saveEmailTemplate(template.key, { subject, html }),
    onSuccess: () => {
      invalidate();
      toast.success('Email template saved');
    },
    onError: (e) => toast.error(e),
  });
  const reset = useMutation({
    mutationFn: () => configApi.resetEmailTemplate(template.key),
    onSuccess: () => {
      invalidate();
      setConfirmReset(false);
      toast.success('Template reset to the default');
    },
    onError: (e) => toast.error(e),
  });
  const test = useMutation({
    mutationFn: (to: string) => configApi.testEmailTemplate(template.key, to),
    onSuccess: (r, to) => {
      setTestTo(null);
      if (r.sent) toast.success(`Test email sent to ${to}`);
      else toast.info('The test email could not be sent. Check the email integration settings.');
    },
    onError: (e) => toast.error(e),
  });

  const insert = (variable: string) => {
    if (!canEdit) return;
    const token = `{{${variable}}}`;
    if (lastFocus.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? start;
      setSubject(subject.slice(0, start) + token + subject.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }
    const el = htmlRef.current;
    const start = el?.selectionStart ?? html.length;
    const end = el?.selectionEnd ?? start;
    setHtml(html.slice(0, start) + token + html.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const validEmail = testTo !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  const chip = (v: string, tone: 'accent' | 'neutral') => (
    <button
      key={v}
      type="button"
      disabled={!canEdit}
      onMouseDown={(e) => e.preventDefault() /* keep the caret in the field */}
      onClick={() => insert(v)}
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset',
        tone === 'accent'
          ? 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-950 dark:text-accent-300 dark:ring-accent-900'
          : 'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
        canEdit ? 'hover:brightness-95' : 'cursor-default',
      )}
      title={canEdit ? `Insert {{${v}}}` : undefined}
    >
      {`{{${v}}}`}
    </button>
  );

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {template.name}
          <code className="text-xs font-normal text-zinc-500">{template.key}</code>
        </span>
      }
      actions={
        <>
          {template.customised ? <Badge tone="warning">Customised</Badge> : <Badge>Default</Badge>}
          {dirty && <Badge tone="warning">Unsaved</Badge>}
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Subject" required>
          <Input ref={subjectRef} value={subject} disabled={!canEdit} onFocus={() => (lastFocus.current = 'subject')} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <div>
          <p className="label">Variables</p>
          <div className="flex flex-wrap gap-1.5">
            {template.variables.length ? template.variables.map((v) => chip(v, 'accent')) : <span className="text-xs text-zinc-500">No template-specific variables.</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-zinc-500">Branding:</span>
            {BRANDING_VARS.map((v) => chip(v, 'neutral'))}
          </div>
          {canEdit && <p className="mt-1 text-xs text-zinc-500">Click a variable to insert it at the cursor.</p>}
        </div>
        <Field label="HTML body" required>
          <Textarea
            ref={htmlRef}
            value={html}
            disabled={!canEdit}
            spellCheck={false}
            onFocus={() => (lastFocus.current = 'html')}
            onChange={(e) => setHtml(e.target.value)}
            className="min-h-[420px] font-mono text-xs leading-relaxed"
          />
        </Field>
        {template.updatedAt && <p className="text-xs text-zinc-500">Last updated {formatDateTime(template.updatedAt)}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Button variant="secondary" icon={<Eye className="size-3.5" />} loading={doPreview.isPending} disabled={!subject.trim() || !html.trim()} onClick={() => doPreview.mutate()}>
            Preview
          </Button>
          {canEdit && (
            <>
              <Button variant="secondary" icon={<Send className="size-3.5" />} onClick={() => setTestTo('')}>
                Send test
              </Button>
              <Button variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={!template.customised} onClick={() => setConfirmReset(true)}>
                Reset to default
              </Button>
              <Button icon={<Save className="size-3.5" />} disabled={!dirty || !subject.trim() || !html.trim()} loading={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Email preview (sample data)" size="xl">
        {preview && (
          <div className="space-y-3">
            <div className="rounded-md border border-zinc-200 px-3 py-2 text-[13px] dark:border-zinc-800">
              <span className="text-zinc-500">Subject: </span>
              <span className="font-medium">{preview.subject}</span>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[60vh] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800" />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        title="Reset to default?"
        message="Your customised subject and HTML will be discarded and the built-in default template used instead."
        confirmLabel="Reset template"
        loading={reset.isPending}
      />
      <Modal
        open={testTo !== null}
        onClose={() => setTestTo(null)}
        title="Send a test email"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestTo(null)}>
              Cancel
            </Button>
            <Button icon={<Send className="size-3.5" />} disabled={!validEmail} loading={test.isPending} onClick={() => testTo && test.mutate(testTo.trim())}>
              Send test
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (validEmail && testTo) test.mutate(testTo.trim());
          }}
        >
          <Field label="Send to" required hint={dirty ? 'Uses the saved version of the template with sample data. Save first to test your edits.' : 'Uses sample data for the variables.'}>
            <Input type="email" autoFocus value={testTo ?? ''} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}

export function EmailTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const templates = useQuery({ queryKey: ['config-email-templates'], queryFn: configApi.emailTemplates });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <QueryState query={templates} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No email templates" />}>
      {(list) => {
        const current = list.find((t) => t.key === selected) ?? list[0];
        return (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="card h-fit overflow-hidden">
              <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {list.map((t) => (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.key)}
                      className={cn(
                        'block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40',
                        current.key === t.key && 'bg-accent-50 dark:bg-accent-950/40',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{t.name}</span>
                        {t.customised && <Badge tone="warning">Customised</Badge>}
                      </span>
                      <code className="text-[11px] text-zinc-500">{t.key}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <TemplateEditor key={current.key} template={current} canEdit={canEdit} />
          </div>
        );
      }}
    </QueryState>
  );
}
