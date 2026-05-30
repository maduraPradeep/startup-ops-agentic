import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { PlatformField } from '@ops/shared';

const QUERY_KEY = 'schema';

// Phase 1b — Schema Builder data layer. Mirrors useEmployees.ts: thin useQuery/useMutation
// wrappers over apiClient with invalidateQueries on success. The mutations DO NOT swallow
// 409/404 — apiClient throws an Error with `.status`/`.data`, which propagates to the caller
// (the controller) so conflicts/not-found can surface inline on the form.

/** Shape of GET /admin/schema/:entity (merged Tier 1 + Tier 2 describe). */
export interface SchemaDescribe {
  entity: string;
  label: string;
  resource: string;
  tool_ops: string[];
  fields: PlatformField[];
}

/** Body for POST /admin/schema/:entity/fields. */
export interface AddFieldBody {
  name: string;
  label?: string;
  field_type: string;
  is_required?: boolean;
  pii?: boolean;
  sort_order?: number;
}

/** Body for PUT /admin/schema/:entity/fields/:name (name is in the path). */
export type UpdateFieldBody = Omit<AddFieldBody, 'name'>;

export function useSchema(entity: string) {
  return useQuery({
    queryKey: [QUERY_KEY, entity],
    queryFn: () => apiClient.get<SchemaDescribe>(`/admin/schema/${entity}`),
    enabled: Boolean(entity),
    staleTime: 60_000,
  });
}

export function useAddField(entity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddFieldBody) =>
      apiClient.post<{ field: PlatformField }>(`/admin/schema/${entity}/fields`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, entity] }),
  });
}

export function useUpdateField(entity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: UpdateFieldBody }) =>
      apiClient.put<{ field: PlatformField }>(`/admin/schema/${entity}/fields/${name}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, entity] }),
  });
}
