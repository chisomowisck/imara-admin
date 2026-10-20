import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile from 'write-excel-file';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportColumnDef<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function text(v: unknown) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side export of table rows to CSV, Excel or PDF, with title and metadata. */
export async function exportRows<T>(format: ExportFormat, fileBase: string, title: string, columns: ExportColumnDef<T>[], rows: T[], generatedBy?: string) {
  const name = `${fileBase}-${stamp()}.${format}`;
  const meta = `Generated ${new Date().toLocaleString()}${generatedBy ? ` by ${generatedBy}` : ''} · ${rows.length} rows`;

  if (format === 'csv') {
    const esc = (v: unknown) => {
      const s = text(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [columns.map((c) => esc(c.header)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\r\n');
    save(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name);
    return;
  }

  if (format === 'xlsx') {
    const data = [
      [{ value: title, fontWeight: 'bold' as const }],
      [{ value: meta }],
      [],
      columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const })),
      ...rows.map((r) =>
        columns.map((c) => {
          const v = c.value(r);
          if (v === null || v === undefined) return null;
          if (typeof v === 'number') return { type: Number, value: v };
          if (v instanceof Date) return { type: Date, value: v, format: 'yyyy-mm-dd hh:mm' };
          return { type: String, value: String(v) };
        }),
      ),
    ];
    await writeXlsxFile(data as any, { fileName: name });
    return;
  }

  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt' });
  doc.setFontSize(13);
  doc.text(title, 32, 36);
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(meta, 32, 50);
  autoTable(doc, {
    startY: 60,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => text(c.value(r)))),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [13, 148, 136] },
    margin: { left: 32, right: 32 },
  });
  doc.save(name);
}
