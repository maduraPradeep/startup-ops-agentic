import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { getSocket } from '../lib/socket';
import { useSidebarStore } from '../stores/sidebar.store';

const QUERY_KEY = 'approvals';

export function usePendingApprovals() {
  const queryClient = useQueryClient();
  const setPendingCount = useSidebarStore((s) => s.setPendingCount);

  useEffect(() => {
    const socket = getSocket();
    socket.on('approval:new', () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    });
    return () => { socket.off('approval:new'); };
  }, [queryClient]);

  return useQuery({
    queryKey: [QUERY_KEY, 'pending'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: unknown[] }>('/approvals/pending');
      setPendingCount(res.data.length);
      return res;
    },
    refetchInterval: 30_000,
  });
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: 'approved' | 'rejected'; notes?: string }) =>
      apiClient.post(`/approvals/${id}/decide`, { decision, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
