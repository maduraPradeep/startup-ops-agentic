import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { usePermissions } from '../../hooks/usePermissions';

export interface ColumnDef {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

export interface CollectionConfig {
  name: string;
  label: string;
  readPermission: string;
  createPermission?: string;
  updatePermission?: string;
  readOnly?: boolean;
  columns: ColumnDef[];
  defaultValues?: Record<string, unknown>;
}

interface Props {
  config: CollectionConfig;
  onEdit: (row: Record<string, unknown>) => void;
  onAdd: () => void;
}

const PAGE_SIZE = 20;

export function EntityDataTable({ config, onEdit, onAdd }: Props) {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const queryKey = ['admin', config.name, page, search];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.get<{ data: { data: Record<string, unknown>[]; meta?: { total_count?: number } } }>(
        `/entities/${config.name}`,
        { params: { page, limit: PAGE_SIZE, ...(search ? { filter: JSON.stringify({ _search: search }) } : {}) } }
      ),
  });

  const rows: Record<string, unknown>[] = (data as any)?.data?.data ?? (data as any)?.data ?? [];
  const total: number = (data as any)?.data?.meta?.total_count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canCreate = !config.readOnly && config.createPermission && can(config.createPermission);
  const canUpdate = !config.readOnly && config.updatePermission && can(config.updatePermission);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        {canCreate && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} />
            Add {config.label.replace(/s$/, '')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        ) : isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">Failed to load {config.label}.</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No records found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {config.columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                {canUpdate && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.id ?? i)} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {config.columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700 max-w-[200px] truncate">
                      {col.render
                        ? col.render(row[col.key], row)
                        : formatCell(row[col.key])}
                    </td>
                  ))}
                  {canUpdate && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onEdit(row)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
        <span>{total} record{total !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60);
  const str = String(value);
  // Detect ISO dates
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try { return new Date(str).toLocaleString(); } catch { /* fallthrough */ }
  }
  return str;
}
