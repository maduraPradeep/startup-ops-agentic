import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { getSocket } from '../lib/socket';
import type { Workflow } from '@ops/shared';

export function useWorkflows() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    socket.on('workflow:updated', (workflow: Workflow) => {
      queryClient.setQueryData(['workflows', workflow.workflow_id], workflow);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    });
    return () => { socket.off('workflow:updated'); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.get<{ data: Workflow[] }>('/workflows/active'),
    refetchInterval: 10_000,
  });
}

export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ['workflows', workflowId],
    queryFn: () => apiClient.get<Workflow>(`/workflows/${workflowId}`),
    enabled: Boolean(workflowId),
    refetchInterval: 5_000,
  });
}
