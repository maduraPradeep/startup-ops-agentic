import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import type { CollectionConfig } from './EntityDataTable';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'date' | 'select' | 'textarea';
  options?: { label: string; value: string }[];
  required?: boolean;
}

export interface FormCollectionConfig extends CollectionConfig {
  fields: FieldDef[];
}

interface Props {
  config: FormCollectionConfig;
  initialData?: Record<string, unknown> | null;
  onClose: () => void;
}

export function EntityFormModal({ config, initialData, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!initialData?.id;

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    config.fields.forEach((f) => { defaults[f.key] = ''; });
    return { ...defaults, ...(config.defaultValues ?? {}), ...initialData };
  });

  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    config.fields.forEach((f) => { defaults[f.key] = ''; });
    setValues({ ...defaults, ...(config.defaultValues ?? {}), ...initialData });
  }, [initialData]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? apiClient.patch(`/entities/${config.name}/${initialData!.id}`, body)
        : apiClient.post(`/entities/${config.name}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', config.name] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    config.fields.forEach((f) => {
      if (values[f.key] !== '' && values[f.key] !== undefined) {
        body[f.key] = values[f.key];
      }
    });
    mutation.mutate(body);
  };

  const set = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {isEdit ? `Edit ${config.label.replace(/s$/, '')}` : `New ${config.label.replace(/s$/, '')}`}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {config.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Select…</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              ) : (
                <input
                  type={field.type}
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              )}
            </div>
          ))}

          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {(mutation.error as any)?.message ?? 'Save failed. Please try again.'}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
