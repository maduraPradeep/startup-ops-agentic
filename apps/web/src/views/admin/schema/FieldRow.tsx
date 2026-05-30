import { Lock, Pencil, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import type { PlatformField } from '@ops/shared';
import { FIELD_TYPE_LABELS, type FieldType } from '../../../lib/schema-builder';

interface Props {
  field: PlatformField;
  onEdit: (field: PlatformField) => void;
}

function typeLabel(fieldType: string): string {
  return FIELD_TYPE_LABELS[fieldType as FieldType] ?? fieldType;
}

// A single merged-schema row. Tier 1 (is_system) is read-only; Tier 2 is editable.
// Color is never the only signal — every badge carries text + icon (a11y, UI-DESIGN §9).
export function FieldRow({ field, onEdit }: Props) {
  const isSystem = field.is_system;
  return (
    <tr className={clsx('border-b border-gray-100 last:border-0', isSystem && 'bg-gray-50')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm text-gray-800 bg-gray-100 px-1 rounded">{field.name}</code>
          {field.label && <span className="text-xs text-gray-500 truncate">{field.label}</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{typeLabel(field.field_type)}</td>
      <td className="px-4 py-3">
        {field.is_required ? (
          <span className="text-xs font-medium text-gray-700">Required</span>
        ) : (
          <span className="text-xs text-gray-400">Optional</span>
        )}
      </td>
      <td className="px-4 py-3">
        {field.pii ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
            <ShieldCheck size={12} /> PII
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {isSystem ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
            <Lock size={12} /> Tier 1 · System
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">
            Tier 2 · Tenant
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {isSystem ? (
          <span className="text-xs text-gray-300">Read-only</span>
        ) : (
          <button
            type="button"
            onClick={() => onEdit(field)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-1.5"
            aria-label={`Edit field ${field.name}`}
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </td>
    </tr>
  );
}
