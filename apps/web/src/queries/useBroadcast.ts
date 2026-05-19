import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface BroadcastPayload {
  title: string;
  message: string;
  audience: 'all' | 'department' | 'role';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channels: Array<'webchat' | 'email' | 'sms'>;
}

export function useBroadcast() {
  const queryClient = useQueryClient();

  const sendBroadcast = useMutation({
    mutationFn: (data: BroadcastPayload) => apiClient.post('/broadcast', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  return { sendBroadcast };
}
