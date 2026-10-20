import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Button, Input, cn } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { exportRows, type ExportFormat } from '@/lib/export';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Plain value used for sorting and export. */
  value?: (row: T) => string | number | boolean | Date | null | undefined;
  sortable?: boolean;
  className?: string;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
  exportable?: boolean;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SortState {
  id: string;
  dir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Server-side pagination; when omitted, rows are paginated client-side. */
  pagination?: PaginationState;
  onPageChange?: (page: number) => void;
  /** Server-side sorting; when omitted, sorting is client-side. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  toolbar?: ReactNode;
  selectable?: boolean;
  selected?: Set<string | number>;
  onSelectedChange?: (selected: Set<string | number>) => void;
  bulkActions?: (selectedRows: T[]) => ReactNode;
  /** Enables the export menu. `fetchAll` lets the table export every matching row, not just the page. */
  exportConfig?: { fileBase: string; title: string; fetchAll?: () => Promise<T[]>; generatedBy?: string };
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rows,
    rowKey,
    loading,
    error,
    onRetry,
    pagination,
    onPageChange,
    sort: controlledSort,
    onSortChange,
    search,
    onSearchChange,
    searchPlaceholder = 'Search…',
    filters,
    toolbar,
    selectable,
    selected = new Set(),
    onSelectedChange,
    bulkActions,
    exportConfig,
    emptyTitle,
    emptyDescription,
    onRowClick,
  } = props;

  const [localSort, setLocalSort] = useState<SortState | null>(null);
  const [localPage, setLocalPage] = useState(1);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const sort = onSortChange ? controlledSort ?? null : localSort;

  const processed = useMemo(() => {
    let list = rows ?? [];
    if (!onSortChange && sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.value) {
        list = [...list].sort((a, b) => {
          const av = col.value!(a);
          const bv = col.value!(b);
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const r = av > bv ? 1 : -1;
          return sort.dir === 'asc' ? r : -r;
        });
      }
    }
    return list;
  }, [rows, sort, columns, onSortChange]);

  const clientPageSize = 25;
  const page = pagination ? pagination.page : localPage;
  const totalPages = pagination ? pagination.totalPages : Math.max(1, Math.ceil(processed.length / clientPageSize));
  const total = pagination ? pagination.total : processed.length;
  const visible = pagination ? processed : processed.slice((localPage - 1) * clientPageSize, localPage * clientPageSize);

  const toggleSort = (id: string) => {
    const next: SortState | null = !sort || sort.id !== id ? { id, dir: 'asc' } : sort.dir === 'asc' ? { id, dir: 'desc' } : null;
    if (onSortChange) onSortChange(next);
    else setLocalSort(next);
  };

  const setPage = (p: number) => (onPageChange ? onPageChange(p) : setLocalPage(p));

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((r) => next.delete(rowKey(r)));
    else visible.forEach((r) => next.add(rowKey(r)));
    onSelectedChange?.(next);
  };
  const toggleOne = (key: string | number) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange?.(next);
  };
  const selectedRows = (rows ?? []).filter((r) => selected.has(rowKey(r)));

  const doExport = async (format: ExportFormat, scope: 'selected' | 'all') => {
    if (!exportConfig) return;
    setExportOpen(false);
    setExporting(format);
    try {
      const data = scope === 'selected' ? selectedRows : exportConfig.fetchAll ? await exportConfig.fetchAll() : processed;
      const cols = columns
        .filter((c) => c.exportable !== false && c.value)
        .map((c) => ({ header: c.header, value: c.value! }));
      await exportRows(format, exportConfig.fileBase, exportConfig.title, cols, data, exportConfig.generatedBy);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      {(onSearchChange || filters || toolbar || exportConfig) && (
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-3 lg:flex-row lg:items-center dark:border-zinc-800">
          {onSearchChange && (
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
              <Input value={search ?? ''} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label="Search" />
            </div>
          )}
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          <div className="flex items-center gap-2 lg:ml-auto">
            {toolbar}
            {exportConfig && (
              <div className="relative">
                <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} loading={!!exporting} onClick={() => setExportOpen((o) => !o)}>
                  Export
                </Button>
                {exportOpen && (
                  <div className="card absolute right-0 z-20 mt-1 w-56 p-1 shadow-lg" onMouseLeave={() => setExportOpen(false)}>
                    {(['xlsx', 'pdf', 'csv'] as ExportFormat[]).map((f) => (
                      <div key={f}>
                        <button className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => doExport(f, 'all')}>
                          {f === 'xlsx' ? 'Excel' : f.toUpperCase()} — all matching rows
                        </button>
                        {selectable && selectedRows.length > 0 && (
                          <button className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => doExport(f, 'selected')}>
                            {f === 'xlsx' ? 'Excel' : f.toUpperCase()} — {selectedRows.length} selected
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 border-b border-accent-200 bg-accent-50 px-3 py-2 text-[13px] dark:border-accent-900 dark:bg-accent-950/40">
          <span className="font-medium">{selectedRows.length} selected</span>
          {bulkActions(selectedRows)}
          <button className="ml-auto text-xs text-zinc-500 hover:underline" onClick={() => onSelectedChange?.(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <EmptyState title={emptyTitle ?? 'No records found'} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-zinc-50 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:bg-zinc-900/60">
              <tr>
                {selectable && (
                  <th className="w-8 px-3 py-2">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all rows" className="accent-accent-600" />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.id} className={cn('px-3 py-2 whitespace-nowrap', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                    {c.sortable ? (
                      <button className="inline-flex items-center gap-1 uppercase hover:text-zinc-800 dark:hover:text-zinc-200" onClick={() => toggleSort(c.id)}>
                        {c.header}
                        {sort?.id === c.id ? sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {visible.map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    className={cn('hover:bg-zinc-50 dark:hover:bg-zinc-800/40', onRowClick && 'cursor-pointer', selected.has(key) && 'bg-accent-50/60 dark:bg-accent-950/30')}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggleOne(key)} aria-label="Select row" className="accent-accent-600" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.id} className={cn('px-3 py-2 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          <span>
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <span>
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
