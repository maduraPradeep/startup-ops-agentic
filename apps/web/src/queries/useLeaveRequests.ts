import {
  useQuery, useMutation, useQueryClient, keepPreviousData,
} from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { LeaveRequest, CreateLeaveRequest } from '@ops/shared';

const QUERY_KEY = 'leave_requests';

export function useLeaveRequests(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: () => apiClient.get<{ data: LeaveRequest[] }>('/entities/leave_requests', { params: filters }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useLeaveRequest(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => apiClient.get<{ data: LeaveRequest }>(`/entities/leave_requests/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeaveRequest) =>
      apiClient.post<{ data: LeaveRequest }>('/entities/leave_requests', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      if (res.data.id) {
        queryClient.setQueryData([QUERY_KEY, res.data.id], res);
      }
    },
  });
}

export function useApproveLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiClient.post(`/entities/leave_requests/${id}/approveRequest`, { approval_notes: notes }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: [QUERY_KEY, id] });
      const previous = queryClient.getQueryData([QUERY_KEY, id]);
      queryClient.setQueryData([QUERY_KEY, id], (old: { data: LeaveRequest } | undefined) =>
        old ? { ...old, data: { ...old.data, status: 'approved' } } : old
      );
      return { previous };
    },
    onError: (_err, { id }, context) => {
      queryClient.setQueryData([QUERY_KEY, id], context?.previous);
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
