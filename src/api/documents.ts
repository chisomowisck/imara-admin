import { get, post, put } from './client';

// ---------- platform print templates ----------

export type TemplateLayout = 'CLASSIC' | 'MODERN' | 'COMPACT' | 'CUSTOM_HTML';
export type PlatformTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type DocumentGroup = 'Sales' | 'Purchases' | 'Platform';

export interface TemplateSettings {
  page: { size: 'A4' | 'LETTER' | 'A5'; orientation: 'portrait' | 'landscape'; marginMm: number };
  /** Empty colour means "use the organisation's branding colour". */
  colors: { primary: string; accent: string; text: string };
  font: 'Helvetica' | 'Inter' | 'Georgia' | 'Times' | 'Verdana' | 'Courier';
  header: { logoPosition: 'left' | 'center' | 'right' | 'none'; style: 'plain' | 'band' | 'boxed'; showLetterhead: boolean; showOrgDetails: boolean; title: string };
  fields: { dueDate: boolean; reference: boolean; paymentTerms: boolean; status: boolean; taxNumbers: boolean; bankDetails: boolean; amountInWords: boolean; qrCode: boolean };
  columns: { lineNumber: boolean; code: boolean; quantity: boolean; unit: boolean; unitPrice: boolean; discount: boolean; taxRate: boolean; taxAmount: boolean; total: boolean };
  text: { notes: string; terms: string; footer: string };
  signatures: { enabled: boolean; labels: string[]; showSignatureImage: boolean; showStamp: boolean };
  watermark: { mode: 'none' | 'status' | 'custom'; text: string };
}

export interface DocumentTypeInfo {
  code: string;
  name: string;
  group: DocumentGroup;
  scope: 'TENANT' | 'PLATFORM';
  printable: boolean;
  sources: string[];
  module: string | null;
}

export interface TemplateEditorInfo {
  types: DocumentTypeInfo[];
  layouts: TemplateLayout[];
  starterHtml: string;
  defaults: Record<string, TemplateSettings>;
}

export interface DocumentTemplate {
  id: number;
  scope: 'TENANT' | 'PLATFORM';
  organizationId: number | null;
  documentType: string;
  name: string;
  description: string | null;
  layout: TemplateLayout;
  settings: TemplateSettings;
  customHtml: string | null;
  customCss: string | null;
  isDefault: boolean;
  status: PlatformTemplateStatus;
  version: number;
  countryCode: string | null;
  orgCategoryCode: string | null;
  sourceTemplateId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTemplate extends DocumentTemplate {
  /** How many organisations copied this template (non-archived copies). */
  copies: number;
}

export interface TemplateVersion {
  id: number;
  templateId: number;
  version: number;
  snapshot: Pick<DocumentTemplate, 'name' | 'description' | 'layout' | 'settings' | 'customHtml' | 'customCss' | 'status'>;
  changeNote: string | null;
  createdAt: string;
}

export interface PlatformTemplateBody {
  documentType?: string;
  name?: string;
  description?: string;
  layout?: TemplateLayout;
  settings?: TemplateSettings;
  customHtml?: string;
  customCss?: string;
  /** '' = every organisation. */
  orgCategoryCode?: string;
  countryCode?: string;
  changeNote?: string;
}

export interface PreviewBody {
  documentType: string;
  layout: TemplateLayout;
  settings: TemplateSettings;
  customHtml?: string;
  customCss?: string;
}

export const documentTemplatesApi = {
  editor: () => get<TemplateEditorInfo>('/admin/document-templates/editor'),
  list: (params?: { documentType?: string; status?: string }) => get<PlatformTemplate[]>('/admin/document-templates', params),
  preview: (body: PreviewBody) => post<{ html: string }>('/admin/document-templates/preview', body),
  get: (id: number) => get<DocumentTemplate>(`/admin/document-templates/${id}`),
  create: (body: PlatformTemplateBody & { documentType: string }) => post<DocumentTemplate>('/admin/document-templates', body),
  update: (id: number, body: PlatformTemplateBody) => put<DocumentTemplate>(`/admin/document-templates/${id}`, body),
  setStatus: (id: number, status: PlatformTemplateStatus) => post<DocumentTemplate>(`/admin/document-templates/${id}/status`, { status }),
  setDefault: (id: number) => post<DocumentTemplate>(`/admin/document-templates/${id}/default`),
  versions: (id: number) => get<TemplateVersion[]>(`/admin/document-templates/${id}/versions`),
  restore: (id: number, version: number) => post<DocumentTemplate>(`/admin/document-templates/${id}/versions/${version}/restore`),
  /** Read-only list of an organisation's own templates. Admins never edit these. */
  tenantTemplates: (organizationId: number) => get<DocumentTemplate[]>(`/admin/tenants/${organizationId}/print-templates`),
};

export const LAYOUT_LABELS: Record<TemplateLayout, string> = {
  CLASSIC: 'Classic',
  MODERN: 'Modern',
  COMPACT: 'Compact',
  CUSTOM_HTML: 'Custom HTML',
};

// ---------- printable platform billing documents ----------

export interface PrintedDocument {
  html: string;
  title: string;
  template: { id: number | null; name: string; scope: string };
}

export const platformPrintApi = {
  invoice: (invoiceId: number, templateId?: number) => get<PrintedDocument>(`/admin/invoices/${invoiceId}/print`, { templateId }),
  receipt: (paymentId: number, templateId?: number) => get<PrintedDocument>(`/admin/payments/${paymentId}/receipt`, { templateId }),
};
