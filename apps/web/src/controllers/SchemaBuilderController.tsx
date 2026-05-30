import { useState } from 'react';
import { X, Table2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { PlatformField } from '@ops/shared';
import {
  useSchema,
  useAddField,
  useUpdateField,
  type AddFieldBody,
} from '../queries/useSchema';
import { SCHEMA_ENTITIES, conflictMessage } from '../lib/schema-builder';
import { FieldList } from '../views/admin/schema/FieldList';
import {
  AddFieldDrawer,
  type FieldFormValues,
  type DrawerServerError,
} from '../views/admin/schema/AddFieldDrawer';

// Phase 1b — Schema Builder controller. Full-page overlay (z-20) reachable from the sidebar
// (see admin-surface.store + AppController). Owns: selected entity, the add/edit drawer state,
// and the mapping of API 409/404/400 responses onto inline, operator-friendly drawer errors.
// The query/mutation layer (useSchema) does not swallow errors — apiClient throws an Error with
// `.status`/`.data`, which we translate here so the AddFieldDrawer can target the right input.

interface Props {
  onClose: () => void;
}

interface DrawerState {
  open: boolean;
  mode: 'add' | 'edit';
  initial: PlatformField | null;
}

const CLOSED: DrawerState = { open: false, mode: 'add', initial: null };

/** Translate a thrown apiClient error into an inline drawer error. */
function toServerError(err: unknown): DrawerServerError {
  const e = err as {
    status?: number;
    message?: string;
    data?: { error?: string; reason?: 'platform_field' | 'tenant_field'; existing?: PlatformField };
  };
  if (e.status === 409) {
    return {
      field: 'name',
      message: conflictMessage(e.data?.reason),
      existing: e.data?.existing ?? null,
    };
  }
  if (e.status === 404) {
    return { message: 'This field no longer exists — it may have been removed. Close and reopen the schema.' };
  }
  if (e.status === 400) {
    return { message: e.data?.error ?? 'Those values aren’t valid. Check the fields and try again.' };
  }
  return { message: e.message || 'Something went wrong saving the field. Please try again.' };
}

export function SchemaBuilderController({ onClose }: Props) {
  const [entity, setEntity] = useState<string>(SCHEMA_ENTITIES[0].entity);
  const [drawer, setDrawer] = useState<DrawerState>(CLOSED);
  const [serverError, setServerError] = useState<DrawerServerError | null>(null);

  const schema = useSchema(entity);
  const addField = useAddField(entity);
  const updateField = useUpdateField(entity);

  const isSaving = addField.isPending || updateField.isPending;

  function selectEntity(next: string) {
    if (next === entity) return;
    setEntity(next);
    setDrawer(CLOSED);
    setServerError(null);
  }

  function openAdd() {
    setServerError(null);
    setDrawer({ open: true, mode: 'add', initial: null });
  }

  function openEdit(field: PlatformField) {
    setServerError(null);
    setDrawer({ open: true, mode: 'edit', initial: field });
  }

  function closeDrawer() {
    setDrawer((d) => ({ ...d, open: false }));
    setServerError(null);
  }

  function handleSubmit(values: FieldFormValues) {
    setServerError(null);
    const common = {
      label: values.label?.trim() ? values.label.trim() : undefined,
      field_type: values.field_type,
      is_required: values.is_required,
      pii: values.pii,
    };

    if (drawer.mode === 'add') {
      const body: AddFieldBody = { name: values.name, ...common };
      addField.mutate(body, {
        onSuccess: closeDrawer,
        onError: (err) => setServerError(toServerError(err)),
      });
    } else if (drawer.initial) {
      updateField.mutate(
        { name: drawer.initial.name, body: common },
        {
          onSuccess: closeDrawer,
          onError: (err) => setServerError(toServerError(err)),
        },
      );
    }
  }

  const selected = SCHEMA_ENTITIES.find((e) => e.entity === entity);

  return (
    <div className="fixed inset-0 z-20 bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Table2 size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">Schema Builder</h1>
            <p className="text-xs text-gray-500 truncate">
              Extend an entity with tenant-specific fields. Built-in fields are read-only.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
          aria-label="Close Schema Builder"
        >
          <X size={18} /> Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
          {/* Entity picker */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Entity</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {SCHEMA_ENTITIES.map((e) => (
                <button
                  key={e.entity}
                  type="button"
                  onClick={() => selectEntity(e.entity)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    e.entity === entity
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
            {selected && (
              <span className="text-xs text-gray-400">
                token <code className="font-mono">{selected.entity}</code>
              </span>
            )}
          </div>

          <FieldList
            fields={schema.data?.fields ?? []}
            isLoading={schema.isLoading}
            error={schema.isError ? (schema.error as Error)?.message ?? 'Unknown error' : null}
            onAddField={openAdd}
            onEditField={openEdit}
            onRetry={() => schema.refetch()}
          />
        </div>
      </div>

      <AddFieldDrawer
        open={drawer.open}
        mode={drawer.mode}
        initial={drawer.initial}
        isSaving={isSaving}
        serverError={serverError}
        onClose={closeDrawer}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
