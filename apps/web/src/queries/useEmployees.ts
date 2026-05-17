import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { Employee, CreateEmployee, UpdateEmployee } from '@ops/shared';

const QUERY_KEY = 'employees';

export function useEmployees(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: () => apiClient.get<{ data: Employee[] }>('/entities/employees', { params: filters }),
    staleTime: 60_000,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => apiClient.get<{ data: Employee }>(`/entities/employees/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmployee) =>
      apiClient.post<{ data: Employee }>('/entities/employees', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEmployee }) =>
      apiClient.patch<{ data: Employee }>(`/entities/employees/${id}`, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      if (res.data.id) {
        queryClient.setQueryData([QUERY_KEY, res.data.id], res);
      }
    },
  });
}
