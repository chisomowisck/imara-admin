import { format, formatDistanceToNow } from 'date-fns';

export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM yyyy');
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM yyyy, HH:mm');
}

export function timeAgo(value?: string | Date | null) {
  if (!value) return '—';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

const mwk = new Intl.NumberFormat('en-MW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMoney(value?: number | string | null, currency = 'MWK') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency} ${mwk.format(Number(value))}`;
}

export function fullName(p?: { firstName?: string | null; lastName?: string | null } | null) {
  return [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—';
}

export function humanize(value?: string | null) {
  if (!value) return '—';
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
