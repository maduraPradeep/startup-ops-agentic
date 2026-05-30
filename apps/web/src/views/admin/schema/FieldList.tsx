import { Database, Plus, AlertTriangle } from 'lucide-react';
import type { PlatformField } from '@ops/shared';
import { sortFields } from '../../../lib/schema-builder';
import { FieldRow } from './FieldRow';

interface Props {
  fields: PlatformField[];
  isLoading: boolean;
  error: string | null;
  onAddField: () => void;
  onEditField: (field: PlatformField) => void;
  onRetry: () => void;
}

function HeaderCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-gray-100 last:border-0">
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-100 rounded h-4 w-40" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-100 rounded h-4 w-20" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-100 rounded h-4 w-16" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-100 rounded h-4 w-10" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-100 rounded h-4 w-24" /></td>
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  );
}

// Presentational fields table for the selected entity. Shows every merged field with a clear
// Tier 1 (system, read-only) vs Tier 2 (tenant, editable) distinction. Handles its own
// loading/error/empty bodies (UI-DESIGN principle: empty states explain what to do next).
export function FieldList({ fields, isLoading, error, onAddField, onEditField, onRetry }: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-red-300 mb-4" />
        <p className="text-base font-medium text-gray-500">Couldn’t load this schema</p>
        <p className="text-sm text-gray-400 mt-1 max-w-xs">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const sorted = sortFields(fields);
  const tenantCount = sorted.filter((f) => !f.is_system).length;
  const showEmpty = !isLoading && sorted.length === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fields</h2>
          <p className="text-xs text-gray-500">
            {isLoading
              ? 'Loading…'
              : `${sorted.length} fields · ${tenantCount} tenant ${tenantCount === 1 ? 'extension' : 'extensions'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          <Plus size={16} /> Add field
        </button>
      </div>

      {showEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Database className="w-12 h-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-500">No fields yet</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            Add a tenant-specific field to extend this entity’s schema.
          </p>
          <button
            type="button"
            onClick={onAddField}
            className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <Plus size={16} /> Add field
          </button>
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Type</HeaderCell>
              <HeaderCell>Required</HeaderCell>
              <HeaderCell>PII</HeaderCell>
              <HeaderCell>Tier</HeaderCell>
              <HeaderCell align="right">Actions</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : (
              sorted.map((f) => <FieldRow key={f.name} field={f} onEdit={onEditField} />)
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
