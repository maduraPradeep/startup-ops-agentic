import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, ShieldCheck, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { PlatformField } from '@ops/shared';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldType } from '../../../lib/schema-builder';

// Local zod schema for the add/edit field form. The valid field_type set comes from the
// shared FIELD_TYPES constant so the form and the API stay in lockstep.
const fieldFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Field name is required')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Use lowercase letters, numbers and underscores; must start with a letter.'
    ),
  label: z.string().optional(),
  field_type: z.enum(FIELD_TYPES),
  is_required: z.boolean(),
  pii: z.boolean(),
});

export type FieldFormValues = z.infer<typeof fieldFormSchema>;

/**
 * Server error to surface inline. `field` targets a specific input (e.g. name collision on
 * 409); when omitted the message renders at the form footer. `existing` is the conflicting
 * field returned by the API so the operator can see what they collided with.
 */
export interface DrawerServerError {
  field?: keyof FieldFormValues;
  message: string;
  existing?: PlatformField | null;
}

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  /** The field being edited (edit mode) — prefills the form; name is locked. */
  initial?: PlatformField | null;
  isSaving: boolean;
  serverError: DrawerServerError | null;
  onClose: () => void;
  onSubmit: (values: FieldFormValues) => void;
}

const inputBase =
  'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500';

// Slide-in drawer (z-30) for adding / editing a Tier 2 field. Client-side validation runs via
// react-hook-form + zod; server-side 409/404 errors arrive via `serverError` and render inline
// at the targeted field (operator-friendly copy, no raw JSON / status codes).
export function AddFieldDrawer({
  open,
  mode,
  initial,
  isSaving,
  serverError,
  onClose,
  onSubmit,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FieldFormValues>({
    resolver: zodResolver(fieldFormSchema),
    defaultValues: {
      name: '',
      label: '',
      field_type: 'string',
      is_required: false,
      pii: false,
    },
  });

  // Reset form state whenever the drawer opens (prefill on edit, clear on add).
  useEffect(() => {
    if (!open) return;
    reset({
      name: initial?.name ?? '',
      label: initial?.label ?? '',
      field_type: (initial?.field_type as FieldType) ?? 'string',
      is_required: initial?.is_required ?? false,
      pii: initial?.pii ?? false,
    });
  }, [open, initial, reset]);

  // Map a field-targeted server error onto the matching input (e.g. name collision → name).
  useEffect(() => {
    if (serverError?.field) {
      setError(serverError.field, { type: 'server', message: serverError.message });
    }
  }, [serverError, setError]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const formError = serverError && !serverError.field ? serverError : null;
  const nameError = errors.name?.message;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'add' ? 'Add tenant field' : 'Edit tenant field'}
        className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'add' ? 'Add tenant field' : 'Edit tenant field'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="field-name" className="block text-sm font-medium text-gray-700 mb-1">
                Field name *
              </label>
              <input
                id="field-name"
                type="text"
                autoComplete="off"
                placeholder="employee_number"
                disabled={mode === 'edit'}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'field-name-error' : 'field-name-hint'}
                className={clsx(
                  inputBase,
                  nameError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-indigo-500'
                )}
                {...register('name')}
              />
              {nameError ? (
                <p id="field-name-error" className="text-xs text-red-500 mt-1">
                  {nameError}
                </p>
              ) : (
                <p id="field-name-hint" className="text-xs text-gray-500 mt-1">
                  {mode === 'edit'
                    ? 'Field name can’t be changed after creation.'
                    : 'Lowercase letters, numbers and underscores only.'}
                </p>
              )}
              {/* When a name collision returns the existing field, show what it collided with. */}
              {serverError?.field === 'name' && serverError.existing && (
                <p className="text-xs text-gray-500 mt-1">
                  Existing field:{' '}
                  <code className="font-mono bg-gray-100 px-1 rounded">{serverError.existing.name}</code>{' '}
                  ({serverError.existing.is_system ? 'platform' : 'tenant'},{' '}
                  {serverError.existing.field_type})
                </p>
              )}
            </div>

            {/* Label */}
            <div>
              <label htmlFor="field-label" className="block text-sm font-medium text-gray-700 mb-1">
                Display label
              </label>
              <input
                id="field-label"
                type="text"
                autoComplete="off"
                placeholder="Employee Number"
                className={clsx(inputBase, 'border-gray-300 focus:ring-indigo-500')}
                {...register('label')}
              />
            </div>

            {/* Type */}
            <div>
              <label htmlFor="field-type" className="block text-sm font-medium text-gray-700 mb-1">
                Data type *
              </label>
              <select
                id="field-type"
                className={clsx(inputBase, 'border-gray-300 focus:ring-indigo-500')}
                {...register('field_type')}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Required */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
              <label htmlFor="field-required" className="text-sm font-medium text-gray-700">
                Required field
              </label>
              <input
                id="field-required"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                {...register('is_required')}
              />
            </div>

            {/* PII */}
            <div className="rounded-lg border border-gray-200 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="field-pii" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-amber-500" /> Contains personal data (PII)
                </label>
                <input
                  id="field-pii"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  {...register('pii')}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Marking a field as PII applies the platform’s data-protection rules to it.
              </p>
            </div>

            {/* Form-level server error (e.g. 404 on edit). */}
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-sm text-red-700">{formError.message}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 min-w-[120px] bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : mode === 'add' ? (
                'Add field'
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
