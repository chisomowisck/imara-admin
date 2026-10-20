import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { configApi } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Tabs } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SettingsForm, type SettingItem } from './SettingsForm';
import { ExchangeRatesTab, ReferenceDataTab, TaxRulesCard } from './ReferenceTabs';
import { CoaTemplatesTab, ModulesTab, RoleTemplatesTab } from './TemplateTabs';
import { EmailTemplatesTab } from './EmailTemplatesTab';

type TabId =
  | 'general'
  | 'billing'
  | 'tax'
  | 'tenant'
  | 'reference'
  | 'rates'
  | 'coa'
  | 'roles'
  | 'modules'
  | 'email'
  | 'integrations'
  | 'security'
  | 'maintenance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General & branding' },
  { id: 'billing', label: 'Billing rules' },
  { id: 'tax', label: 'Tax' },
  { id: 'tenant', label: 'Tenant defaults' },
  { id: 'reference', label: 'Reference data' },
  { id: 'rates', label: 'Exchange rates' },
  { id: 'coa', label: 'COA templates' },
  { id: 'roles', label: 'Role templates' },
  { id: 'modules', label: 'Modules' },
  { id: 'email', label: 'Email templates' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Security' },
  { id: 'maintenance', label: 'Feature flags & maintenance' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------- field definitions ----------------

const BRANDING_FIELDS: SettingItem[] = [
  { key: 'platformName', label: 'Platform name', type: 'text' },
  { key: 'logoUrl', label: 'Logo URL', type: 'text', hint: 'Public https URL of a PNG/SVG logo; used in emails and the tenant app.', placeholder: 'https://…' },
  { key: 'supportEmail', label: 'Support email', type: 'text' },
  { key: 'supportPhone', label: 'Support phone', type: 'text' },
  { key: 'termsUrl', label: 'Terms of service URL', type: 'text' },
  { key: 'privacyUrl', label: 'Privacy policy URL', type: 'text' },
];

const BILLING_FIELDS: SettingItem[] = [
  { heading: 'Numbering' },
  { key: 'baseCurrency', label: 'Base currency', type: 'text', readOnly: true, hint: 'All plans and invoices are billed in MWK.' },
  { key: 'invoiceNumberFormat', label: 'Invoice number format', type: 'text', hint: 'Tokens: {YYYY} {YY} {SEQ:5}' },
  { key: 'creditNoteNumberFormat', label: 'Credit note number format', type: 'text', hint: 'Tokens: {YYYY} {YY} {SEQ:5}' },
  { heading: 'Payment & dunning' },
  { key: 'paymentDueDays', label: 'Payment due (days after invoice)', type: 'number', min: 0 },
  { key: 'gracePeriodDays', label: 'Grace period (days)', type: 'number', min: 0, hint: 'Days after the due date before overdue actions start.' },
  { key: 'manualPaymentSuspendAfterDays', label: 'Suspend manual payers after (days overdue)', type: 'number', min: 0, hint: '0 = never' },
  { key: 'dunningRetryDays', label: 'Dunning retry days', type: 'list', numeric: true, hint: 'Comma-separated days after the first failure, ascending, e.g. 1, 3, 7' },
  { key: 'dunningSuspendDay', label: 'Dunning suspension day', type: 'number', min: 1, hint: 'Must come after the last retry day.' },
  { heading: 'Trials, retention & limits' },
  { key: 'trialEnabled', label: 'Free trial enabled', type: 'checkbox' },
  { key: 'trialDays', label: 'Trial length (days)', type: 'number', min: 0 },
  { key: 'dataRetentionDays', label: 'Data retention after archive (days)', type: 'number', min: 30 },
  { key: 'limitWarningPercent', label: 'Limit warning threshold (%)', type: 'number', min: 1, hint: 'Warn tenants when usage reaches this share of a plan limit.' },
  { key: 'allowImmediatePlanChange', label: 'Allow immediate plan changes', type: 'checkbox', hint: 'When off, plan changes take effect at the next billing cycle.' },
];

const TAX_FIELDS: SettingItem[] = [
  { key: 'vatRate', label: 'VAT rate (%)', type: 'number', step: '0.01', min: 0 },
  { key: 'vatAppliesToCountries', label: 'VAT applies to countries', type: 'list', hint: 'Comma-separated ISO country codes, e.g. MW' },
  { key: 'vatOnSubscriptionInvoices', label: 'Charge VAT on subscription invoices', type: 'checkbox' },
];

const TENANT_FIELDS: SettingItem[] = [
  { heading: 'Locale' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'countryCode', label: 'Country code', type: 'text' },
  { key: 'currency', label: 'Currency', type: 'text' },
  { key: 'dateFormat', label: 'Date format', type: 'text', placeholder: 'DD/MM/YYYY' },
  { key: 'numberFormat', label: 'Number format', type: 'text', placeholder: '1,000.00' },
  { heading: 'Accounting periods' },
  { key: 'fiscalYearStartMonth', label: 'Fiscal year start month', type: 'select', options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })) },
  { key: 'fiscalYearStartDay', label: 'Fiscal year start day', type: 'number', min: 1 },
  {
    key: 'periodLength',
    label: 'Period length',
    type: 'select',
    options: [
      { value: 'MONTHLY', label: 'Monthly' },
      { value: 'QUARTERLY', label: 'Quarterly' },
      { value: 'YEARLY', label: 'Yearly' },
    ],
  },
  { key: 'defaultPaymentTermDays', label: 'Default payment terms (days)', type: 'number', min: 0 },
  { key: 'withholdingRate', label: 'Withholding tax rate (%)', type: 'number', step: '0.01', min: 0 },
  { heading: 'Document prefixes' },
  { key: 'invoicePrefix', label: 'Invoice prefix', type: 'text' },
  { key: 'billPrefix', label: 'Bill prefix', type: 'text' },
  { key: 'journalPrefix', label: 'Journal prefix', type: 'text' },
  { key: 'receiptPrefix', label: 'Receipt prefix', type: 'text' },
  { key: 'paymentPrefix', label: 'Payment prefix', type: 'text' },
];

const isOneKhusa = (d: Record<string, string | boolean>) => d.paymentGateway === 'ONEKHUSA';
const isSmtp = (d: Record<string, string | boolean>) => d.emailProvider === 'SMTP';
const isResend = (d: Record<string, string | boolean>) => d.emailProvider === 'RESEND';

const INTEGRATION_FIELDS: SettingItem[] = [
  { heading: 'Payments' },
  {
    key: 'paymentGateway',
    label: 'Payment gateway',
    type: 'select',
    options: [
      { value: 'MOCK', label: 'Sandbox / mock (no real money)' },
      { value: 'ONEKHUSA', label: 'OneKhusa' },
    ],
  },
  {
    key: 'onekhusaMode',
    label: 'OneKhusa mode',
    type: 'select',
    options: [
      { value: 'test', label: 'Test' },
      { value: 'live', label: 'Live' },
    ],
  },
  { key: 'onekhusaMerchantId', label: 'OneKhusa merchant ID', type: 'text' },
  { key: 'onekhusaBaseUrl', label: 'OneKhusa API base URL', type: 'text', placeholder: 'https://…' },
  { key: 'onekhusaApiKey', label: 'OneKhusa API key', type: 'secret' },
  { key: 'onekhusaWebhookSecret', label: 'OneKhusa webhook secret', type: 'secret' },
  { heading: 'Email delivery' },
  {
    key: 'emailProvider',
    label: 'Email provider',
    type: 'select',
    options: [
      { value: 'ENV', label: 'Use server environment settings' },
      { value: 'SMTP', label: 'SMTP' },
      { value: 'RESEND', label: 'Resend' },
    ],
  },
  { key: 'emailFrom', label: 'From address', type: 'text', placeholder: 'Imara <no-reply@imara.mw>' },
  { key: 'smtpHost', label: 'SMTP host', type: 'text', visible: isSmtp },
  { key: 'smtpPort', label: 'SMTP port', type: 'number', min: 1, visible: isSmtp },
  { key: 'smtpUser', label: 'SMTP user', type: 'text', visible: isSmtp },
  { key: 'smtpPassword', label: 'SMTP password', type: 'secret', visible: isSmtp },
  { key: 'smtpSecure', label: 'Use TLS (secure connection)', type: 'checkbox', visible: isSmtp },
  { key: 'resendApiKey', label: 'Resend API key', type: 'secret', visible: isResend },
];

const SECURITY_FIELDS: SettingItem[] = [
  { key: 'adminSessionIdleMinutes', label: 'Admin idle timeout (minutes)', type: 'number', min: 5, hint: 'Between 5 and 480 minutes.' },
  { key: 'adminSessionAbsoluteHours', label: 'Admin absolute session length (hours)', type: 'number', min: 1 },
  { key: 'adminPasswordMaxAgeDays', label: 'Admin password max age (days)', type: 'number', min: 0, hint: '0 = never' },
  { key: 'adminAllowedGoogleDomains', label: 'Allowed Google sign-in domains', type: 'list', hint: 'Comma-separated, e.g. imara.mw. Empty = Google sign-in not restricted by domain.' },
  { key: 'adminAllowEmailOtpFallback', label: 'Allow email OTP fallback', type: 'checkbox', hint: 'When off, admins with an authenticator app must use it.', full: true },
];

const MAINTENANCE_FIELDS: SettingItem[] = [
  { key: 'enabled', label: 'Maintenance mode enabled', type: 'checkbox', full: true },
  { key: 'message', label: 'Message shown to tenant users', type: 'textarea' },
  { key: 'startsAt', label: 'Starts at', type: 'datetime', hint: 'Optional; empty = immediately.' },
  { key: 'endsAt', label: 'Ends at', type: 'datetime', hint: 'Optional; empty = until switched off.' },
];

const WEBHOOK_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1'}/webhooks/payments/onekhusa`;

// ---------------- helpers ----------------

type SettingsQuery = ReturnType<typeof useSettings>;

function useSettings() {
  return useQuery({ queryKey: ['config-settings'], queryFn: configApi.settings });
}

/** Renders loading / error / empty states for one settings category. */
function CategoryState({ query, category, children }: { query: SettingsQuery; category: string; children: (values: Record<string, any>) => ReactNode }) {
  return (
    <QueryState query={query} isEmpty={(d) => !d || !(category in d)}>
      {(d) => children(d[category] ?? {})}
    </QueryState>
  );
}

function BrandingPreview({ name, logoUrl }: { name: string; logoUrl: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  return (
    <div>
      <p className="label">Preview</p>
      <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        {logoUrl && !broken ? (
          <img src={logoUrl} alt="" className="h-9 max-w-[120px] object-contain" onError={() => setBroken(true)} />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-md bg-accent-600 text-sm font-semibold text-white">{(name || 'I').charAt(0).toUpperCase()}</div>
        )}
        <span className="text-base font-semibold tracking-tight">{name || 'Platform name'}</span>
      </div>
      {logoUrl && broken && <p className="mt-1 text-xs text-red-600">The logo could not be loaded from this URL.</p>}
    </div>
  );
}

function WebhookUrl() {
  const toast = useToast();
  return (
    <Field label="OneKhusa webhook URL" hint="Register this URL with OneKhusa so payment confirmations reach Imara.">
      <div className="flex gap-2">
        <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="secondary"
          icon={<Copy className="size-3.5" />}
          onClick={() =>
            navigator.clipboard
              .writeText(WEBHOOK_URL)
              .then(() => toast.success('Webhook URL copied'))
              .catch(() => toast.error('Could not copy to the clipboard'))
          }
        >
          Copy
        </Button>
      </div>
    </Field>
  );
}

// ---------------- feature flags ----------------

function FeatureFlagsCard({ values, canEdit }: { values: Record<string, unknown>; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initialKey = JSON.stringify(Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, v === true])));
  const [flags, setFlags] = useState<Record<string, boolean>>(() => JSON.parse(initialKey));
  const [newKey, setNewKey] = useState('');
  useEffect(() => setFlags(JSON.parse(initialKey)), [initialKey]);
  const dirty = JSON.stringify(flags) !== initialKey;
  const save = useMutation({
    mutationFn: () => {
      // Removed flags are sent as false so the backend (which merges keys) clears them.
      const original = JSON.parse(initialKey) as Record<string, boolean>;
      const body: Record<string, boolean> = { ...flags };
      for (const k of Object.keys(original)) if (!(k in flags)) body[k] = false;
      return configApi.saveSettings('featureFlags', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-settings'] });
      toast.success('Feature flags saved');
    },
    onError: (e) => toast.error(e),
  });
  const keyValid = /^[A-Za-z][A-Za-z0-9_.-]*$/.test(newKey.trim()) && !(newKey.trim() in flags);
  const entries = Object.entries(flags).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card title="Feature flags" actions={dirty ? <Badge tone="warning">Unsaved</Badge> : !canEdit ? <Badge>Read only</Badge> : undefined}>
      <div className="space-y-3">
        <p className="text-[13px] text-zinc-500">Platform-wide switches read by the tenant application. Flags not listed here are off.</p>
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-[13px] text-zinc-500 dark:border-zinc-700">No feature flags defined.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {entries.map(([k, v]) => (
              <li key={k} className="flex items-center gap-3 px-3 py-2">
                <code className="flex-1 truncate text-xs">{k}</code>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" className="accent-accent-600" checked={v} disabled={!canEdit} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />
                  {v ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
                </label>
                {canEdit && (
                  <button
                    type="button"
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    aria-label={`Remove ${k}`}
                    onClick={() => {
                      const next = { ...flags };
                      delete next[k];
                      setFlags(next);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!keyValid) return;
                setFlags({ ...flags, [newKey.trim()]: false });
                setNewKey('');
              }}
            >
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_flag_key" className="font-mono text-xs" aria-label="New flag key" />
              <Button type="submit" variant="secondary" icon={<Plus className="size-3.5" />} disabled={!keyValid}>
                Add flag
              </Button>
            </form>
            <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <Button variant="secondary" icon={<Undo2 className="size-3.5" />} disabled={!dirty} onClick={() => setFlags(JSON.parse(initialKey))}>
                Discard
              </Button>
              <Button icon={<Save className="size-3.5" />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                Save flags
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------- page ----------------

export function ConfigurationPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const canManage = can('config.manage');
  const canSecrets = canManage && can('config.secrets');

  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && TABS.some((t) => t.id === requested) ? requested : 'general';
  const setTab = (id: TabId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
      },
      { replace: true },
    );

  let content: ReactNode;
  switch (tab) {
    case 'general':
      content = (
        <CategoryState query={settings} category="branding">
          {(v) => (
            <SettingsForm
              category="branding"
              title="General & branding"
              description="Shown in system emails, the tenant application and public pages."
              values={v}
              items={BRANDING_FIELDS}
              canEdit={canManage}
              extra={(d) => <BrandingPreview name={String(d.platformName ?? '')} logoUrl={String(d.logoUrl ?? '').trim()} />}
            />
          )}
        </CategoryState>
      );
      break;
    case 'billing':
      content = (
        <div className="space-y-4">
          <Alert tone="info" title="PRD defaults">
            VAT 16.5% on subscription invoices; failed auto-renew payments are retried on Day 1, 3 and 7 with suspension on Day 14; archived data is retained for 365 days; free trials last 14 days. All values are configurable here.
          </Alert>
          <CategoryState query={settings} category="billing">
            {(v) => <SettingsForm category="billing" title="Billing rules" values={v} items={BILLING_FIELDS} canEdit={canManage} />}
          </CategoryState>
        </div>
      );
      break;
    case 'tax':
      content = (
        <div className="space-y-4">
          <Alert tone="info">VAT at 16.5% is the PRD default and is configurable (marked "to be discussed" in the PRD). Changes apply to invoices issued after saving and are logged as critical.</Alert>
          <CategoryState query={settings} category="tax">
            {(v) => <SettingsForm category="tax" title="Subscription VAT" values={v} items={TAX_FIELDS} canEdit={canManage} />}
          </CategoryState>
          <TaxRulesCard canEdit={canManage} />
        </div>
      );
      break;
    case 'tenant':
      content = (
        <CategoryState query={settings} category="tenantDefaults">
          {(v) => (
            <SettingsForm
              category="tenantDefaults"
              title="Tenant defaults"
              description="Applied when a new organisation is provisioned. Existing organisations keep their own settings."
              values={v}
              items={TENANT_FIELDS}
              canEdit={canManage}
            />
          )}
        </CategoryState>
      );
      break;
    case 'reference':
      content = <ReferenceDataTab canEdit={canManage} />;
      break;
    case 'rates':
      content = <ExchangeRatesTab canEdit={canManage} />;
      break;
    case 'coa':
      content = <CoaTemplatesTab canEdit={canManage} />;
      break;
    case 'roles':
      content = <RoleTemplatesTab canEdit={canManage} />;
      break;
    case 'modules':
      content = <ModulesTab canEdit={canManage} />;
      break;
    case 'email':
      content = <EmailTemplatesTab canEdit={canManage} />;
      break;
    case 'integrations':
      content = (
        <div className="space-y-4">
          {canManage && !canSecrets && <Alert tone="warning">Saving integration settings requires the "config.secrets" permission. The values below are read only.</Alert>}
          <CategoryState query={settings} category="integrations">
            {(v) => (
              <SettingsForm
                category="integrations"
                title="Integrations"
                description="Secrets are stored encrypted and never shown in full. Leave a secret field empty to keep its current value. Changes are logged as critical."
                values={v}
                items={INTEGRATION_FIELDS}
                canEdit={canSecrets}
                extra={(d) => (
                  <div className="space-y-3">
                    <Alert tone={isOneKhusa(d) ? 'warning' : 'info'}>OneKhusa API documentation and credentials are pending; keep payments on the sandbox until then.</Alert>
                    <WebhookUrl />
                  </div>
                )}
                confirmBeforeSave={(patch) =>
                  patch.paymentGateway === 'ONEKHUSA' || patch.onekhusaMode === 'live'
                    ? {
                        title: 'Switch payment settings?',
                        message: 'Tenants will be charged through OneKhusa with the saved settings. Make sure the credentials have been verified first.',
                        confirmLabel: 'Save settings',
                      }
                    : null
                }
              />
            )}
          </CategoryState>
        </div>
      );
      break;
    case 'security':
      content = (
        <div className="space-y-4">
          <Alert tone="info">MFA is always required for admins.</Alert>
          <CategoryState query={settings} category="security">
            {(v) => <SettingsForm category="security" title="Admin console security" description="Changes are logged as critical and apply to new sessions." values={v} items={SECURITY_FIELDS} canEdit={canManage} />}
          </CategoryState>
        </div>
      );
      break;
    case 'maintenance':
      content = (
        <div className="space-y-4">
          <CategoryState query={settings} category="maintenance">
            {(v) => (
              <SettingsForm
                category="maintenance"
                title="Maintenance mode"
                values={v}
                items={MAINTENANCE_FIELDS}
                canEdit={canManage}
                extra={(d) =>
                  d.enabled ? (
                    <Alert tone="danger" title={v.enabled ? 'Maintenance mode is ON' : 'You are about to enable maintenance mode'}>
                      Tenant users will be blocked with this message; the admin console stays available.
                    </Alert>
                  ) : null
                }
                confirmBeforeSave={(_patch, d) =>
                  d.enabled
                    ? {
                        title: 'Save with maintenance mode enabled?',
                        message: (
                          <>
                            Tenant users will be blocked with this message during the window
                            {d.startsAt || d.endsAt ? ' you set' : ' (starting immediately, until switched off)'}; the admin console stays available.
                          </>
                        ),
                        confirmLabel: 'Enable maintenance',
                      }
                    : null
                }
                saveLabel="Save maintenance settings"
              />
            )}
          </CategoryState>
          <CategoryState query={settings} category="featureFlags">
            {(v) => <FeatureFlagsCard values={v} canEdit={canManage} />}
          </CategoryState>
        </div>
      );
      break;
  }

  return (
    <div>
      <PageHeader
        title="Global configuration"
        description="Platform-wide settings, templates and reference data. Changes are recorded in the audit trail."
        actions={!canManage && <Badge>Read only — requires config.manage to edit</Badge>}
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {content}
    </div>
  );
}
